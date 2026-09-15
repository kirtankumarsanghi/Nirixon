# Data Dictionary — screening_data_items.csv
## Child-level fields
- `child_id`: synthetic identifier, no real-world meaning
- `age_months`: chronological age at screening (0-60)
- `corrected_age_months`: prematurity-adjusted age; used for ALL age-relative logic (label derivation, imputation) instead of chronological age
- `age_bracket`: ASQ-3-style bracket label (e.g. '12mo', '24mo') derived from corrected_age_months. One of 17 values defined in age_brackets.py. This is a MODEL FEATURE (ordinal-encoded as age_bracket_ordinal) as well as the grouping key for per-bracket analysis.
- `age_bracket_ordinal`: integer 0–16, ordinal encoding of age_bracket (0 = youngest '2mo', 16 = oldest '60mo'). This is the feature column that enters the ML model.
- `family_history_flag`: 1 if family history of developmental delay
- `multilingual_home_flag`: 1 if home is multilingual — CONTEXT, not a penalty; must show no correlation with domain scores (checked in Stage 2)
- `regression_flag`: 1 if child has lost a previously-acquired skill — a high-weight red flag independent of the smooth age trend
- `risk_label`: Typical / Monitor / Refer — derived label, NOT a model input

## Item-level fields (36 columns, one per item, coded 0 / 1 / 2)
Response scale: 0 = 0 times in the past week, 1 = 1-2 times, 2 = 3+ times

| item_id | domain | motor_confound | live_elicitation_eligible | typical_age_months | valid_brackets | bracket_assignment_unconfirmed | text |
|---|---|---|---|---|---|---|---|
| GM01 | gross_motor | False | True | 2 | 2mo, 4mo, 6mo | confirmed | How many times in the past week has your child lifted their head while lying on their tummy? |
| GM02 | gross_motor | False | True | 5 | 4mo, 6mo, 9mo | confirmed | How many times in the past week has your child rolled from tummy to back or back to tummy? |
| GM03 | gross_motor | False | True | 8 | 6mo, 9mo, 12mo | confirmed | How many times in the past week has your child sat without support for a few minutes? |
| GM04 | gross_motor | False | True | 11 | 9mo, 12mo, 15mo | NEEDS CLINICAL REVIEW | How many times in the past week has your child pulled themselves up to stand? |
| GM05 | gross_motor | False | True | 14 | 12mo, 15mo, 18mo, 21mo, 24mo | NEEDS CLINICAL REVIEW | How many times in the past week has your child walked a few steps without holding on? |
| GM06 | gross_motor | False | True | 30 | 27mo, 30mo, 33mo, 36mo, 42mo, 48mo, 54mo, 60mo | confirmed | How many times in the past week has your child run, jumped with both feet, or climbed stairs one step at a time? |
| FM01 | fine_motor | False | True | 3 | 2mo, 4mo, 6mo | NEEDS CLINICAL REVIEW | How many times in the past week has your child brought their hands together at the middle of their body? |
| FM02 | fine_motor | False | True | 5 | 4mo, 6mo, 9mo | NEEDS CLINICAL REVIEW | How many times in the past week has your child reached for and grabbed a nearby toy? |
| FM03 | fine_motor | False | True | 8 | 6mo, 9mo, 12mo, 15mo | confirmed | How many times in the past week has your child passed a toy from one hand to the other? |
| FM04 | fine_motor | False | True | 11 | 9mo, 12mo, 15mo, 18mo | NEEDS CLINICAL REVIEW | How many times in the past week has your child picked up a small object using thumb and finger? |
| FM05 | fine_motor | False | True | 18 | 15mo, 18mo, 21mo, 24mo, 27mo, 30mo | confirmed | How many times in the past week has your child scribbled with a crayon on paper? |
| FM06 | fine_motor | True | True | 20 | 18mo, 21mo, 24mo, 27mo, 30mo, 33mo, 36mo, 42mo, 48mo, 54mo, 60mo | confirmed | How many times in the past week has your child stacked two or more small blocks? |
| CM01 | communication | False | False | 2 | 2mo, 4mo, 6mo | confirmed | How many times in the past week has your child made cooing or gurgling sounds? |
| CM02 | communication | False | False | 4 | 4mo, 6mo, 9mo | confirmed | How many times in the past week has your child turned toward a familiar voice or sound? |
| CM03 | communication | False | False | 8 | 6mo, 9mo, 12mo, 15mo | confirmed | How many times in the past week has your child babbled with repeated syllables (e.g. 'ba-ba', 'da-da')? |
| CM04 | communication | False | False | 12 | 12mo, 15mo, 18mo, 21mo | NEEDS CLINICAL REVIEW | How many times in the past week has your child said a clear word with meaning (not just babbling)? |
| CM05 | communication | True | True | 14 | 12mo, 15mo, 18mo, 21mo, 24mo | NEEDS CLINICAL REVIEW | How many times in the past week has your child pointed at something to show you it, without being asked? |
| CM06 | communication | False | False | 24 | 21mo, 24mo, 27mo, 30mo, 33mo, 36mo, 42mo, 48mo, 54mo, 60mo | confirmed | How many times in the past week has your child put two or more words together (e.g. 'more milk')? |
| CG01 | cognitive | False | True | 8 | 2mo, 4mo, 6mo, 9mo, 12mo | confirmed | How many times in the past week has your child looked for a toy after watching it get hidden? |
| CG02 | cognitive | True | True | 10 | 4mo, 9mo, 12mo, 15mo | confirmed | How many times in the past week has your child imitated a simple action you did (e.g. clapping)? |
| CG03 | cognitive | True | True | 16 | 15mo, 18mo, 21mo, 24mo | confirmed | How many times in the past week has your child used an object correctly in pretend play (e.g. pretend-drinking from a cup)? |
| CG04 | cognitive | False | True | 18 | 18mo, 21mo, 24mo, 27mo, 30mo | confirmed | How many times in the past week has your child pointed to a named body part when asked? |
| CG05 | cognitive | True | True | 30 | 27mo, 30mo, 33mo, 36mo, 42mo, 48mo, 54mo, 60mo | confirmed | How many times in the past week has your child sorted objects by shape or color? |
| CG06 | cognitive | True | True | 36 | 33mo, 36mo, 42mo, 48mo, 54mo, 60mo | NEEDS CLINICAL REVIEW | How many times in the past week has your child completed a simple 3-4 piece puzzle? |
| PS01 | personal_social | False | False | 2 | 2mo, 4mo, 6mo | confirmed | How many times in the past week has your child smiled back at you or another familiar person? |
| PS02 | personal_social | False | False | 4 | 4mo, 6mo, 9mo | confirmed | How many times in the past week has your child laughed out loud during play? |
| PS03 | personal_social | False | True | 8 | 6mo, 9mo, 12mo, 15mo | confirmed | How many times in the past week has your child played simple back-and-forth games (e.g. peekaboo)? |
| PS04 | personal_social | False | False | 14 | 12mo, 15mo, 18mo, 21mo, 24mo | NEEDS CLINICAL REVIEW | How many times in the past week has your child shown a favorite toy or object to you? |
| PS05 | personal_social | False | False | 24 | 21mo, 24mo, 27mo, 30mo, 33mo, 36mo, 42mo, 48mo, 54mo, 60mo | confirmed | How many times in the past week has your child played alongside (not necessarily with) other children? |
| PS06 | personal_social | False | False | 36 | 33mo, 36mo, 42mo, 48mo, 54mo, 60mo | NEEDS CLINICAL REVIEW | How many times in the past week has your child taken turns or shared a toy with another child? |
| SH01 | self_help | False | False | 6 | 2mo, 4mo, 6mo, 9mo | confirmed | How many times in the past week has your child brought their hand or an object to their mouth to feed themselves? |
| SH02 | self_help | True | True | 9 | 9mo, 12mo, 15mo | confirmed | How many times in the past week has your child held their own bottle or cup? |
| SH03 | self_help | False | False | 10 | 9mo, 12mo, 15mo, 18mo | confirmed | How many times in the past week has your child fed themselves with fingers? |
| SH04 | self_help | True | True | 15 | 12mo, 15mo, 18mo, 21mo, 24mo, 27mo | confirmed | How many times in the past week has your child tried to use a spoon by themselves, even messily? |
| SH05 | self_help | False | False | 18 | 15mo, 18mo, 21mo, 24mo, 27mo, 30mo, 33mo, 36mo | confirmed | How many times in the past week has your child helped by pushing an arm through a sleeve while being dressed? |
| SH06 | self_help | False | False | 28 | 27mo, 30mo, 33mo, 36mo, 42mo, 48mo, 54mo, 60mo | NEEDS CLINICAL REVIEW | How many times in the past week has your child indicated (through words, sounds, or gesture) that their diaper is wet or they need the toilet? |
