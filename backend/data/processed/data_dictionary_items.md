# Data Dictionary — screening_data_items.csv
## Child-level fields
- `child_id`: synthetic identifier, no real-world meaning
- `age_months`: chronological age at screening (0-60)
- `corrected_age_months`: prematurity-adjusted age; used for ALL age-relative logic (label derivation, imputation) instead of chronological age
- `family_history_flag`: 1 if family history of developmental delay
- `multilingual_home_flag`: 1 if home is multilingual — CONTEXT, not a penalty; must show no correlation with domain scores (checked in Stage 2)
- `regression_flag`: 1 if child has lost a previously-acquired skill — a high-weight red flag independent of the smooth age trend
- `risk_label`: Typical / Monitor / Refer — derived label, NOT a model input

## Item-level fields (36 columns, one per item, coded 0 / 1 / 2)
Response scale: 0 = 0 times in the past week, 1 = 1-2 times, 2 = 3+ times

| item_id | domain | motor_confound | live_elicitation_eligible | typical_age_months | text |
|---|---|---|---|---|---|
| GM01 | gross_motor | False | True | 2 | How many times in the past week has your child lifted their head while lying on their tummy? |
| GM02 | gross_motor | False | True | 5 | How many times in the past week has your child rolled from tummy to back or back to tummy? |
| GM03 | gross_motor | False | True | 8 | How many times in the past week has your child sat without support for a few minutes? |
| GM04 | gross_motor | False | True | 11 | How many times in the past week has your child pulled themselves up to stand? |
| GM05 | gross_motor | False | True | 14 | How many times in the past week has your child walked a few steps without holding on? |
| GM06 | gross_motor | False | True | 30 | How many times in the past week has your child run, jumped with both feet, or climbed stairs one step at a time? |
| FM01 | fine_motor | False | True | 3 | How many times in the past week has your child brought their hands together at the middle of their body? |
| FM02 | fine_motor | False | True | 5 | How many times in the past week has your child reached for and grabbed a nearby toy? |
| FM03 | fine_motor | False | True | 8 | How many times in the past week has your child passed a toy from one hand to the other? |
| FM04 | fine_motor | False | True | 11 | How many times in the past week has your child picked up a small object using thumb and finger? |
| FM05 | fine_motor | False | True | 18 | How many times in the past week has your child scribbled with a crayon on paper? |
| FM06 | fine_motor | True | True | 20 | How many times in the past week has your child stacked two or more small blocks? |
| CM01 | communication | False | False | 2 | How many times in the past week has your child made cooing or gurgling sounds? |
| CM02 | communication | False | False | 4 | How many times in the past week has your child turned toward a familiar voice or sound? |
| CM03 | communication | False | False | 8 | How many times in the past week has your child babbled with repeated syllables (e.g. 'ba-ba', 'da-da')? |
| CM04 | communication | False | False | 12 | How many times in the past week has your child said a clear word with meaning (not just babbling)? |
| CM05 | communication | True | True | 14 | How many times in the past week has your child pointed at something to show you it, without being asked? |
| CM06 | communication | False | False | 24 | How many times in the past week has your child put two or more words together (e.g. 'more milk')? |
| CG01 | cognitive | False | True | 8 | How many times in the past week has your child looked for a toy after watching it get hidden? |
| CG02 | cognitive | True | True | 10 | How many times in the past week has your child imitated a simple action you did (e.g. clapping)? |
| CG03 | cognitive | True | True | 16 | How many times in the past week has your child used an object correctly in pretend play (e.g. pretend-drinking from a cup)? |
| CG04 | cognitive | False | True | 18 | How many times in the past week has your child pointed to a named body part when asked? |
| CG05 | cognitive | True | True | 30 | How many times in the past week has your child sorted objects by shape or color? |
| CG06 | cognitive | True | True | 36 | How many times in the past week has your child completed a simple 3-4 piece puzzle? |
| PS01 | personal_social | False | False | 2 | How many times in the past week has your child smiled back at you or another familiar person? |
| PS02 | personal_social | False | False | 4 | How many times in the past week has your child laughed out loud during play? |
| PS03 | personal_social | False | True | 8 | How many times in the past week has your child played simple back-and-forth games (e.g. peekaboo)? |
| PS04 | personal_social | False | False | 14 | How many times in the past week has your child shown a favorite toy or object to you? |
| PS05 | personal_social | False | False | 24 | How many times in the past week has your child played alongside (not necessarily with) other children? |
| PS06 | personal_social | False | False | 36 | How many times in the past week has your child taken turns or shared a toy with another child? |
| SH01 | self_help | False | False | 6 | How many times in the past week has your child brought their hand or an object to their mouth to feed themselves? |
| SH02 | self_help | True | True | 9 | How many times in the past week has your child held their own bottle or cup? |
| SH03 | self_help | False | False | 10 | How many times in the past week has your child fed themselves with fingers? |
| SH04 | self_help | True | True | 15 | How many times in the past week has your child tried to use a spoon by themselves, even messily? |
| SH05 | self_help | False | False | 18 | How many times in the past week has your child helped by pushing an arm through a sleeve while being dressed? |
| SH06 | self_help | False | False | 28 | How many times in the past week has your child indicated (through words, sounds, or gesture) that their diaper is wet or they need the toilet? |
