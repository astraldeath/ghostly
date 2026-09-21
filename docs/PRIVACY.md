# Ghostly privacy statement

Ghostly processes Firefox browsing history locally to apply rules and remove matching URLs. It does not transmit browsing history, cleanup rules, or statistics. It has no analytics, accounts, advertising, or remote code.

Online lists are optional. Adding one contacts the HTTPS URL you supply after Firefox grants access to its host. The host receives the requested list URL and your network IP address. Requests omit cookies, credentials and referrers. Saved subscriptions are checked daily and on request. Downloaded updates require your review and Save before affecting active rules. No history is sent to list hosts. Removing a list and saving stops its future update checks; you can also revoke its host access through Firefox extension permissions.

Firefox local extension storage contains settings, aggregate cleanup counts, and job progress. Preview samples are held temporarily in memory and displayed only in the options page. Job checkpoints contain time ranges, counts, and settings revisions; they do not contain history URLs.

Exporting settings creates a file on your device containing rules, protected-site patterns, retention, and appearance. That file may reveal sites you have chosen to manage. It does not contain your history. You control where you store or share it.

Permissions: `history` reads and deletes history; `storage` saves settings, cached lists, pending updates and progress; `alarms` schedules local cleanup and subscription checks. Optional HTTPS host access fetches only lists you add. Deletion is permanent. Pause automation in Ghostly settings or disable the extension in Firefox to stop automatic cleanup.

Uninstalling removes extension-managed local storage under Firefox's normal extension behavior. Exported files remain wherever you saved them. Deleting history does not promise removal from other devices, Firefox Sync replicas, or third-party records.
