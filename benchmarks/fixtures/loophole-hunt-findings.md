# Loophole hunt: findings

Generated from `benchmarks/results/loophole-hunt.json` (run 2026-11-06), following [the pre-registered plan](loophole-hunt-plan.md). 319 cases: `claude-sonnet-5-5` wrote them, `claude-haiku-5-5` labelled each independently, and only cases where the two agree count. These are generator and confirmer labels, not human review. claude-sonnet-5-5 and claude-haiku-5-5 reject temperature; both ran at their defaults.

**Nothing in `src/` was changed for these.** The confirmed misses of `checkAnswer` are in `__tests__/fixtures/lexical-checks/known-gaps.jsonl`, marked `"known gap"`; `__tests__/unit/evaluate/known-gaps.test.js` fails only if one of them starts being caught, so the list stays current.

Every surface is lexical, so a claim that keeps the source's words and numbers passes, whatever it changes. Ranked by `checkAnswer`'s miss rate (confirmed meaning-changing claims it supports):

| Rank | Category             | Missed by checkAnswer | CitationTracker | Faithfulness | False alarms on controls | Label disagreements |
| ---- | -------------------- | --------------------- | --------------- | ------------ | ------------------------ | ------------------- |
| 1    | role-swap            | 30/30 (100%)          | 30/30           | 30/30        | 5/9                      | 1                   |
| 2    | attribution-dropped  | 29/29 (100%)          | 29/29           | 29/29        | 2/10                     | 1                   |
| 3    | quantifier-scope     | 28/30 (93%)           | 28/30           | 29/30        | 6/7                      | 2                   |
| 4    | comparison-direction | 28/30 (93%)           | 28/30           | 28/30        | 7/9                      | 1                   |
| 5    | modality             | 26/28 (93%)           | 26/28           | 26/28        | 3/9                      | 3                   |
| 6    | time-bounds          | 26/28 (93%)           | 26/28           | 26/28        | 5/7                      | 5                   |
| 7    | hedge-removed        | 26/29 (90%)           | 26/29           | 26/29        | 2/10                     | 1                   |
| 8    | exception-dropped    | 9/28 (32%)            | 9/28            | 9/28         | 3/10                     | 2                   |

The false alarms on the controls are faithful paraphrases that fail on word overlap, the existing lexical behaviour; judge mode is the answer to those.

## 1. role-swap: 100% missed

1. Source: "The employer must reimburse the employee for approved travel expenses within 30 days of receiving the expense report."  
   Claim: "The employee must reimburse the employer for approved travel expenses within 30 days of receiving the expense report."

2. Source: "The contractor shall deliver the completed work to the client by 1 March, and the client shall pay 40% of the fee upon delivery."  
   Claim: "The client shall deliver the completed work to the contractor by 1 March, and the contractor shall pay 40% of the fee upon delivery."

3. Source: "The doctor should inform the caregiver of any dosage change at least 24 hours before it takes effect."  
   Claim: "The caregiver should inform the doctor of any dosage change at least 24 hours before it takes effect."

**Suggested fix.** Compare the order of the actors. In the claim and its closest source sentence, take the content nouns both share; when two of them appear in the opposite order around the main verb ("the employer ... the employee" vs "the employee ... the employer"), flag a role mismatch. A cheap version: the first occurrences of each shared noun, compared as a sequence.

## 2. attribution-dropped: 100% missed

1. Source: "According to the HR memo, the attendance policy will be revised in January, pending board approval."  
   Claim: "The attendance policy will be revised in January."

2. Source: "The landlord states that the deposit was returned on March 3, though the tenant disputes ever receiving it."  
   Claim: "The deposit was returned on March 3."

3. Source: "A small trial suggests that aspirin may lower the risk of preeclampsia in high-risk pregnancies."  
   Claim: "Aspirin lowers the risk of preeclampsia in high-risk pregnancies."

**Suggested fix.** Treat attribution as a restricting clause, like 3.9's conditions: "according to ...", "<someone> suggests/states/claims/reports (that)", "a study found", "pending ...", "disputes". A claim that keeps none of the attribution's words states as fact what the source only reports.

## 3. quantifier-scope: 93% missed

1. Source: "Full-time employees who have completed 90 days of service are eligible for the company dental plan."  
   Claim: "All employees who have completed 90 days of service are eligible for the company dental plan."

2. Source: "Either party may terminate this agreement by giving 30 days' written notice to the other party."  
   Claim: "Only the client may terminate this agreement by giving 30 days' written notice to the other party."

3. Source: "Most adults with mild hypertension can bring their blood pressure down with lifestyle changes alone."  
   Claim: "All adults with mild hypertension can bring their blood pressure down with lifestyle changes alone."

**Suggested fix.** Compare quantifiers and scope qualifiers between the claim and its closest source sentence: all/every/any/each, most/many/some/few, only, either/both, and qualifiers on the subject (full-time, adult, existing). A quantifier in the claim the source doesn't use, or a qualifier the claim drops, is a scope mismatch.

## 4. comparison-direction: 93% missed

1. Source: "Employees must give at least 14 days' notice before taking annual leave of more than five consecutive days."  
   Claim: "Employees must give at most 14 days' notice before taking annual leave of more than five consecutive days."

2. Source: "Adults should get at least 150 minutes of moderate aerobic activity each week."  
   Claim: "Adults should get at most 150 minutes of moderate aerobic activity each week."

3. Source: "The battery retains more than 80% of its original capacity after 500 charge cycles."  
   Claim: "The battery retains less than 80% of its original capacity after 500 charge cycles."

**Suggested fix.** Carry a comparator with each number in the numeric check: at least/at most, more than/less than/fewer, over/under, minimum/maximum, exceeds/below. The same number with the opposite comparator is a number mismatch.

## 5. modality: 93% missed

1. Source: "Employees may work remotely up to two days per week with manager approval."  
   Claim: "Employees must work remotely two days per week with manager approval."

2. Source: "The Buyer may terminate this Agreement by giving 30 days' written notice to the Seller."  
   Claim: "The Buyer must terminate this Agreement by giving 30 days' written notice to the Seller."

3. Source: "Adults with a mild headache can take ibuprofen 200 mg every six hours, but should not exceed 1,200 mg in a day."  
   Claim: "Adults with a mild headache are required to take ibuprofen 200 mg every six hours, and must not exceed 1,200 mg in a day."

**Suggested fix.** Classify each clause's modal: permission (may, can, could, is allowed to) vs obligation (must, shall, is required to, will, has to) vs advice (should). A claim clause whose modal class differs from its matched source clause is a modality mismatch.

## 6. time-bounds: 93% missed

1. Source: "Accrued leave days may be carried over into the next calendar year, but they must be used by March 31."  
   Claim: "Accrued leave days carried over into the next calendar year may be used whenever the employee chooses."

2. Source: "The deposit is refundable if the tenant gives written notice at least 30 days before the lease start date."  
   Claim: "The deposit is refundable if the tenant gives written notice at least 30 days after the lease start date."

3. Source: "Take the antibiotic twice daily for 7 days, and finish the full course even if your symptoms improve sooner."  
   Claim: "Take the antibiotic twice daily for as long as needed, even after your symptoms improve."

**Suggested fix.** Attach time-bound words (before, after, until, by <date>, within <period>) to the dates and periods they govern, like the comparator above; a reversed bound (before vs after) is a mismatch. A dropped bound ("must be used by March 31" removed) can be a restricting clause in the 3.9 condition check.

## 7. hedge-removed: 90% missed

1. Source: "Absences of up to three consecutive days generally do not require a doctor's note."  
   Claim: "Absences of up to three consecutive days do not require a doctor's note."

2. Source: "The contractor will complete the basement renovation in approximately 12 weeks from the start date."  
   Claim: "The contractor will complete the basement renovation in 12 weeks from the start date."

3. Source: "Ibuprofen typically begins to relieve pain within 30 to 60 minutes of being taken."  
   Claim: "Ibuprofen begins to relieve pain within 30 to 60 minutes of being taken."

**Suggested fix.** A hedge in the source (up to, approximately, about, around, typically, generally, usually, often, roughly, may) that the claim drops makes the claim more absolute. Check it like a condition: the claim must keep the hedge, or one of its synonyms.

## 8. exception-dropped: 32% missed

1. Source: "Liability for damages is capped at $50,000 for all claims, except those arising from gross negligence or willful misconduct."  
   Claim: "Liability for damages is capped at $50,000 for all claims, except those arising from willful misconduct."

2. Source: "Gift cards can be used on all items except clearance items and other gift cards."  
   Claim: "Gift cards can be used on all items except clearance items."

3. Source: "Departing employees must return all company equipment, including laptops, badges, and phones, except the ergonomic chair, which they may keep."  
   Claim: "Departing employees must return all company equipment, including laptops, badges, phones, and the ergonomic chair."

**Suggested fix.** 3.9's "except" marker already catches most of these. The rest drop an item inside an exception list ("gross negligence or willful misconduct" becomes "willful misconduct") or move an excepted item into the main list. Compare exception lists item by item: every item of the source's exception must be in the claim's.
