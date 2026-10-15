"""Weighted Cohen's kappa between a clinician and the tool on the vignette study.
python src/agreement.py data/vignette_template.csv   (needs clinician_label and tool_label filled)"""
import sys
import pandas as pd
from sklearn.metrics import cohen_kappa_score, confusion_matrix

order = ["Typical", "Monitor", "Refer"]
df = pd.read_csv(sys.argv[1]).dropna(subset=["clinician_label", "tool_label"])
a = df.clinician_label.map(order.index); b = df.tool_label.map(order.index)
print("n =", len(df))
print("quadratic-weighted kappa:", round(cohen_kappa_score(a, b, weights="quadratic"), 3))
print("confusion matrix (rows clinician, columns tool):\n", pd.DataFrame(confusion_matrix(a, b, labels=[0, 1, 2]), index=order, columns=order))
ref = a == 2
print("Refer cases:", int(ref.sum()), "| tool caught:", int(((b == 2) & ref).sum()))
print("With 40 cases the interval is wide: call this a face-validity check, not accuracy.")
