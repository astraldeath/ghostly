# Settings backups and recovery

Version 2 exports contain `{ "version": 2, "settings": ... }`. Settings include schema version, revision, paused state, theme, lists, exclusions and retentionDays. Lists have unique IDs, a name, enabled state and typed rules (`domain`, `wildcard`, `regex`). Imported paused state is always forced to true.

Version 1 imports contain `{ "version": 1, "lists": ... }`, as exported by Ghostly 1.0. They contain no exclusions, theme or retention. Importing replaces the entire editor; review protected sites before saving.

Limits: 64 MiB file, 100 lists, 500,000 domain rules and 1,000 wildcard/regex rules combined, 500 exclusions, 80 characters per list name, 500 characters per rule and a whole-number retention age from 0 to 36500 days. Rule limits include exclusions and disabled lists. Invalid input is rejected with an error rather than silently dropping protections.

If existing stored settings cannot be migrated, Ghostly starts paused in recovery mode and preserves the original storage. Open Backup & restore and choose **Export recovery backup**. This produces `{ "version": "recovery", "data": ... }` containing the original settings keys. Correct the reported validation issue in a copy (for example, shorten an old list name), import the repaired file, review it and save. Or create new settings and explicitly confirm replacement. Keep the recovery file until you verify everything you need was retained.
