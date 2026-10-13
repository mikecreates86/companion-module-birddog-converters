## BirdDog Converters

This module allows you to control BirdDog NDI encoders and decoders.

### Requirements

- BirdDog converter running the latest NDI 5 firmware version

### Configuration

- Enter the IP address or hostname of the BirdDog device in the module settings

### Optional self-recovery settings (all off by default)

- **Auto-recover when the NDI feed drops and returns:** if the unit loses its feed (for example the sending app is closed), the module keeps retrying every 30 seconds and re-selects the source once it is back.
- **Also restart video after the feed returns:** restarts the unit's video output a few seconds after the feed is back. The picture blanks briefly.
- **Restart video on a schedule:** restarts the unit's video every 1 to 48 hours, or never (the default).

Actions in the log appear as plain notes, so you can see when the module recovered a unit.

### Available actions

- Change Decode Source
  - _Note: when using custom sources, you must include the full name (ex. `PTZ-1 (CAM)` instead of `PTZ-1`)_
- Refresh NDI Source List
- Jump to Next/Previous Decode Source
- Reboot Device
- Restart Video System

### Available variables

- decode_source
- current_mode
- video_format
- video_resolution
- video_framerate
- source_status
- last_update (time of the last status change the unit reported)
