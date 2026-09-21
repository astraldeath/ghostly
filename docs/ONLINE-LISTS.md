# Online lists

Add an HTTPS URL under Rules → Add online list. Grant Firefox access to the source host, review the downloaded rules, enable the list if desired, then save. New subscriptions start disabled. Source rules are read-only; names and enabled state remain editable.

Ghostly checks saved subscriptions every 24 hours. Expanded lists show their source, last check or failure, and a manual check button. Changes appear as an added/removed rule review. Use update stages the downloaded rules; Save applies them. Downloads never activate rules or delete history by themselves. Existing protections always apply. Removing a subscription uses the ordinary list removal and Save flow.

The cached active rules are included in settings backups and work offline. Restored subscriptions require host permission before updates can be fetched. A failed download does not replace active rules. Updates invalidate cleanup previews when saved, through the existing settings revision mechanism.

Publish either UTF-8 plain text (one domain per line; blank lines and lines beginning with # or ! are ignored), or JSON:

```json
{
  "version": 1,
  "name": "Example list",
  "rules": [
    { "type": "domain", "value": "example.com" },
    { "type": "wildcard", "value": "*example.com/redirect*" }
  ]
}
```

JSON accepts Ghostly domain, wildcard and regex rules. uBlock/Adblock and hosts-file syntax are not supported. Unsupported or invalid rules reject the entire download. Limits: 256 KB per download, 1,000 rules per list, and the existing 1,000 total rules across saved settings. Redirects are rejected; use the final raw HTTPS URL. Downloads time out after 15 seconds, omit credentials and referrers, and require source-host permission. List hosts can observe the request and IP address, but no browsing history is sent.

The development browser preview uses a synthetic subscription response; it never contacts the supplied host. Network behavior is covered separately by automated tests.

Extension and toolbar icons remain SVGs derived from Lucide, with the upstream license bundled. Screenshot PNGs under docs are browser captures, not generated artwork.
