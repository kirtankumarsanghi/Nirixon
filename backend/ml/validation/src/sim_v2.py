"""Simulator v2: a hidden true status generates noisy answers; the label comes from the
hidden status and is never recomputed from the answers (Module A plan, step 4)."""

from functools import lru_cache

import numpy as np
import pandas as pd
from config import SimConfig

LN3 = np.log(
    3.0
)  # sigmoid(ln 3) = 0.75, so item difficulty m = age75 - ln3 * s puts 75% passing at age75


def make_placeholder_items(domains, n_per_domain=40, seed=1):
    """Placeholder item bank. REPLACE with data/item_source.csv built from CDC / WHO / GSED anchors."""
    rng = np.random.default_rng(seed)
    rows = []
    for d in domains:
        a75 = np.sort(rng.uniform(3, 60, n_per_domain))
        for i, a in enumerate(a75):
            rows.append(
                {
                    "item_id": f"{d[:3].upper()}{i:02d}",
                    "domain": d,
                    "age75_months": a,
                    "s_months": 0.07 * a + 0.8,
                    "source": "placeholder (author-set)",
                    "age75_status": "AUTHOR-SET",
                    "s_status": "AUTHOR-SET",
                }
            )
    return pd.DataFrame(rows)


def load_items(path, domains):
    try:
        df = pd.read_csv(path)
        need = {
            "item_id",
            "domain",
            "age75_months",
            "s_months",
            "source",
            "age75_status",
            "s_status",
        }
        assert need <= set(df.columns), f"item file needs columns {need}"
        assert (
            df[["age75_months", "s_months"]].notna().all().all()
        ), "fill age75_months and s_months for every item"
        valid_age_statuses = {"SOURCED", "AUTHOR-SET", "UNVERIFIED"}
        assert set(df["age75_status"]).issubset(
            valid_age_statuses
        ), f"invalid status in age75_status: {set(df['age75_status']) - valid_age_statuses}"
        valid_s_statuses = {"WHO-DERIVED", "AUTHOR-SET"}
        assert set(df["s_status"]).issubset(
            valid_s_statuses
        ), f"invalid status in s_status: {set(df['s_status']) - valid_s_statuses}"
        missing = set(domains) - set(df.domain)
        assert not missing, f"no items for domains {missing}"
        return df
    except FileNotFoundError:
        return make_placeholder_items(domains)


@lru_cache(maxsize=32)
def status_cuts(target_mix, g_weight, n_domains, n_ref=400_000, seed=123):
    """Cutoffs on the worst-domain ability so that the hidden status hits target_mix.
    Prevalence is therefore an explicit design setting, not an accident of the generator.
    """
    rng = np.random.default_rng(seed)
    g = rng.normal(size=n_ref)
    th = g_weight * g[:, None] + np.sqrt(1 - g_weight**2) * rng.normal(
        size=(n_ref, n_domains)
    )
    worst = th.min(1)
    refer_cut = np.quantile(worst, target_mix[2])
    monitor_cut = np.quantile(worst, target_mix[2] + target_mix[1])
    return float(refer_cut), float(monitor_cut)


def empirical_pace(age_months):
    """Age-varying developmental pace grounded in WHO Motor Study and van Buuren GSED:
    velocity is highest in early infancy (0.20) and tapers into preschool (0.12)."""
    return np.clip(0.20 - 0.0015 * np.asarray(age_months), 0.11, 0.22)


def simulate(
    cfg: SimConfig, items: pd.DataFrame, n: int, seed: int, selection: str = "nearest"
):
    rng = np.random.default_rng(seed)
    D, K = len(cfg.domains), cfg.items_asked_per_domain
    age = rng.uniform(cfg.age_min, cfg.age_max, n)
    g = rng.normal(size=n)
    theta = cfg.g_weight * g[:, None] + np.sqrt(1 - cfg.g_weight**2) * rng.normal(
        size=(n, D)
    )

    age_used = age.copy()  # age the app uses to pick items
    if cfg.preterm_error_share > 0:
        wrong = rng.random(n) < cfg.preterm_error_share
        shift = rng.choice([-3.0, -2.0, 2.0, 3.0], wrong.sum())
        age_used[wrong] = np.clip(age[wrong] + shift, cfg.age_min, cfg.age_max)

    use_freq = getattr(cfg, "response_scale", "binary") == "frequency"
    use_emp_pace = getattr(cfg, "pace_mode", "fixed") == "empirical"
    eff_pace = empirical_pace(age) if use_emp_pace else cfg.pace

    if selection == "within6":
        answers = np.full((n, D, K), np.nan)
        say_yes = rng.random(n) < cfg.yes_bias_share
        for j, d in enumerate(cfg.domains):
            it = items[items.domain == d]
            a75 = it.age75_months.to_numpy()
            s = it.s_months.to_numpy()
            m = a75 - LN3 * s
            diff = np.abs(a75[None, :] - age_used[:, None])
            for i in range(n):
                close = np.where(diff[i] <= 6.0)[0]
                if len(close) >= K:
                    idx_i = close[np.argsort(diff[i, close])[:K]]
                elif len(close) >= 1:
                    idx_i = close[np.argsort(diff[i, close])]
                else:
                    idx_i = np.argsort(diff[i])[:1]

                pace_i = eff_pace[i] if use_emp_pace else eff_pace
                dev_age = age[i] * np.exp(pace_i * theta[i, j])
                eta_i = (dev_age - m[idx_i]) / s[idx_i]

                if use_freq:
                    p_ge1 = cfg.slip + (1 - 2 * cfg.slip) / (
                        1 + np.exp(-(eta_i + 0.70))
                    )
                    p_ge2 = cfg.slip + (1 - 2 * cfg.slip) / (
                        1 + np.exp(-(eta_i - 0.70))
                    )
                    u_i = rng.random(len(idx_i))
                    ans_i = np.where(u_i > p_ge1, 0, np.where(u_i > p_ge2, 1, 2))
                    if say_yes[i]:
                        ans_i = np.full(len(idx_i), 2)
                    if cfg.flip_rate > 0:
                        flip = rng.random(len(ans_i)) < cfg.flip_rate
                        ans_i = np.where(flip, rng.choice([0, 1, 2], len(ans_i)), ans_i)
                else:
                    p_i = 1 / (1 + np.exp(-eta_i))
                    p_i = cfg.slip + (1 - 2 * cfg.slip) * p_i
                    ans_i = rng.random(len(p_i)) < p_i
                    if say_yes[i]:
                        ans_i = np.ones(len(p_i), dtype=bool)
                    if cfg.flip_rate > 0:
                        flip = rng.random(len(ans_i)) < cfg.flip_rate
                        ans_i = np.where(flip, ~ans_i, ans_i)
                answers[i, j, : len(idx_i)] = ans_i
        domain_scores = np.nanmean(answers, axis=2) / (2.0 if use_freq else 1.0)
    elif selection == "nearest":
        answers = np.zeros((n, D, K))
        say_yes = rng.random(n) < cfg.yes_bias_share
        for j, d in enumerate(cfg.domains):
            it = items[items.domain == d]
            a75 = it.age75_months.to_numpy()
            s = it.s_months.to_numpy()
            m = a75 - LN3 * s
            idx = np.argsort(np.abs(a75[None, :] - age_used[:, None]), axis=1)[
                :, :K
            ]  # items nearest the age used

            if use_freq:
                pace_col = eff_pace[:, None] if use_emp_pace else eff_pace
                dev_age = age[:, None] * np.exp(pace_col * theta[:, j : j + 1])
                eta = (dev_age - m[idx]) / s[idx]
                p_ge1 = cfg.slip + (1 - 2 * cfg.slip) / (1 + np.exp(-(eta + 0.70)))
                p_ge2 = cfg.slip + (1 - 2 * cfg.slip) / (1 + np.exp(-(eta - 0.70)))
                u = rng.random(p_ge1.shape)
                y = np.where(u > p_ge1, 0, np.where(u > p_ge2, 1, 2))
                y[say_yes, :] = 2
                if cfg.flip_rate > 0:
                    flip = rng.random(y.shape) < cfg.flip_rate
                    y = np.where(flip, rng.choice([0, 1, 2], y.shape), y)
            else:
                dev_age = age * np.exp(
                    cfg.pace * theta[:, j]
                )  # true development drives answers
                p = 1 / (1 + np.exp(-(dev_age[:, None] - m[idx]) / s[idx]))
                p = cfg.slip + (1 - 2 * cfg.slip) * p
                y = rng.random(p.shape) < p
                y = y | say_yes[:, None]
                if cfg.flip_rate > 0:
                    y = np.where(rng.random(y.shape) < cfg.flip_rate, ~y, y)
            answers[:, j, :] = y
        domain_scores = answers.mean(2) / (2.0 if use_freq else 1.0)
    else:
        raise ValueError(f"Unknown selection mode: {selection}")

    refer_cut, monitor_cut = status_cuts(cfg.target_mix, cfg.g_weight, D)
    worst = theta.min(1)
    status = np.where(
        worst < refer_cut, 2, np.where(worst < monitor_cut, 1, 0)
    )  # from hidden theta only

    out = {
        "age": age,
        "age_used": age_used,
        "answers": answers,
        "domain_scores": domain_scores,
        "status": status,
        "theta": theta,
    }
    if getattr(cfg, "enable_guards", False):
        from guards import compute_guards

        out["guards"] = compute_guards(age_used, answers, items, cfg.domains, K)
    return out


def features(sim, mode="domain"):
    if mode == "raw":
        if np.isnan(sim["answers"]).any():
            raise ValueError(
                "answers contains NaN; cannot extract raw features when selection has variable items per child"
            )
        return np.c_[sim["age_used"], sim["answers"].reshape(len(sim["age"]), -1)]
    return np.c_[sim["age_used"], sim["domain_scores"]]
