# Campaign emails are sent directly from Google Workspace and Microsoft 365 mailboxes

Campaign emails are sent through the Gmail API and Microsoft Graph from mailboxes connected to the Workspace, and replies and bounces are detected on those same mailboxes.
We considered delegating sending to a cold-email platform (Smartlead, Instantly, lemlist, EmailBison), but those host data in the US or Australia, charge per customer, and document their reply events poorly, while sending directly gives us one integration with the mailboxes Recruiters already use and full control over threading and reply detection.
The consequence is that we own deliverability ourselves: warmup, per-mailbox sending caps, bounce and complaint handling, and reputation monitoring.
Reply detection on Gmail needs restricted OAuth scopes, so the app goes through Google's verification and annual CASA security assessment.
