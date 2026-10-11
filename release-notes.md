# 2.1.0
**What's new**
- New optional settings to make units recover on their own when an NDI feed drops and comes back (for example when ProPresenter is closed and reopened). All are off by default:
  - Keep retrying every 30 seconds while the feed is missing, then re-select the source when it returns.
  - Optionally restart the unit's video a few seconds after the feed returns.
  - Optionally restart the unit's video every N hours.
- Every automatic recovery is written to the Companion log in plain words.

**How to install:** download `birddog-converters-2.1.0.tgz` below, then in Companion use Modules > Import module package. Then open the connection settings to turn the new options on.
