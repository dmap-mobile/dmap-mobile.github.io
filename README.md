# Duke Forest DMAP mobile hunter system

This is the hunter-only mobile application for the Duke Forest DMAP reservation system.

## Included workflow

- Hunter sign-in using first initial and hunter number.
- Korstian and Durham reservation maps.
- Read-only researcher messages for hunters.
- Manual and automatic availability refresh.
- Daily and seasonal hunter statistics.
- High-contrast map legend and reservation overlays.
- Mobile-safe map sizing, zoom controls, and touch scrolling when zoomed.
- Deer logging and atomic Firebase clock-out updates.
- Dedicated clock-out confirmation page.
- Logout and checkout are blocked until today’s reservation is verified.
- Small-phone typography and controls are kept on one line where the label must remain immediately understandable.

The researcher reservation interface is intentionally not included. The hunter application still reads the existing researcher reservation and message documents from Firestore.

## Firestore paths used

- `reserved/researchers/dates/{YYYY-MM-DD}` — research-reserved cells.
- `reserved/researchers/messages/hunters` — active hunter notice.
- `reserved/hunters/dates/{YYYY-MM-DD}` — all hunter-reserved cells.
- `reserved/hunters/hunterID/{hunter}/dates/{YYYY-MM-DD}` — one hunter’s daily record.
- `reserved/hunters/hunterID/{hunter}` — one hunter’s season totals.

## Before deployment

1. Confirm that Firestore rules permit the hunter client to read the documents used for messages and statistics.
2. Confirm that the `initial` field is present on each hunter profile document.
3. Add the approved Duke Forest correction/contact phone number to `pages/clockout.html` if one should appear on the clock-out page.
4. Test the application on the actual shared tablet and the intended phones, including poor connectivity.
