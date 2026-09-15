# Growth dashboard runtime fix

The private `/admin/growth` route must use `queryAllRecords` from `lib/airtable.js` for paginated reads. `getAllRecords` is not exported by the runtime helper. This regression is covered by `tests/growth-dashboard-runtime.test.mjs`.
