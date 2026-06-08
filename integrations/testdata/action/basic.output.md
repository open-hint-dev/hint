## [REUSABLE AUTOMATION SCRIPTS: invalidateSessionCache]

The following action is registered as a macro behavior. Whenever the described condition is met or this action is referenced by name in other blocks, execute the following steps exactly:

Whenever a user logs out, closes their tab explicitly, or completes a checkout sequence, find their session token inside our Redis store and purge it instantly.
