# Feature Brief: Activation Dashboard for Customer Success

## Context

Our customer success managers currently ask the data team for a one-off export whenever they want to know how a new customer is settling in.
The export arrives a day late, every CSM slices it differently, and nobody can tell whether a customer who went quiet in week two ever came back.

## Goal

Give each CSM a self-serve activation dashboard for the accounts they own, so they can spot a stalling onboarding before the customer churns.

## Desired behavior

- I open the dashboard and see an activation funnel for one account: signed up, invited a teammate, connected a data source, published a first report.
- I can switch the funnel between the accounts I own using a dropdown at the top of the page.
- I can compare a cohort of accounts that signed up in the same month against the previous month's cohort.
- I can see a 30-day retention curve for the selected cohort, and hover any point to get the underlying count in a tooltip.
- I can toggle between weekly and monthly buckets without reloading the page.
- When an account is too new to have any events yet, the dashboard shows an empty state that explains what will appear once tracking data arrives, rather than a chart with zero bars.

## Constraints

- The first version reads from the existing event tracking pipeline; no new instrumentation.
- A CSM only sees accounts they are assigned to.
- The dashboard extends the existing customer detail area rather than becoming a separate product surface.
- Events arrive with up to one hour of lag, and the dashboard should be honest about that rather than implying real time.

## Non-goals

- No custom funnel builder; the four activation steps are fixed for now.
- No scheduled email digests or exports.
- No cross-account benchmarking against other customers.
