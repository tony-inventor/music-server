import win32gui
import win32api
import win32con
import argparse
import os
import sys 
import time


class WinampController:
    def __init__(self):
        self.class_name = "Winamp v1.x"
        self.hwnd = self._find_winamp()
        self.IPC_GETSET_VOLUME = 122

    def _find_winamp(self):
        return win32gui.FindWindow(self.class_name, None)

    def is_running(self):
        """Check if Winamp is currently running."""
        return self._find_winamp() != 0

    def launch(self):
        """Launch Winamp if not already running. Returns True if successful or already running."""
        if self.is_running():
            return True

        # Try common Winamp installation paths
        possible_paths = [
            r"C:\Program Files (x86)\Winamp\winamp.exe",
            r"C:\Program Files\Winamp\winamp.exe",
            r"C:\Winamp\winamp.exe",
        ]

        winamp_path = None
        for path in possible_paths:
            if os.path.exists(path):
                winamp_path = path
                break

        # If not found in common paths, try to find in registry or PATH
        if not winamp_path:
            try:
                import winreg
                with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"Software\Winamp") as key:
                    winamp_path = winreg.QueryValue(key, None)
                    if winamp_path and not winamp_path.endswith("winamp.exe"):
                        winamp_path = os.path.join(winamp_path, "winamp.exe")
            except:
                pass

        if winamp_path and os.path.exists(winamp_path):
            os.startfile(winamp_path)
            # Wait a bit for Winamp to start
            time.sleep(3)
            self.hwnd = self._find_winamp()
            return self.hwnd != 0

        return False

    def send_command(self, cmd, count=1):
        if not self.hwnd:
            self.hwnd = self._find_winamp()
        if self.hwnd:
            for _ in range(count):
                win32api.SendMessage(self.hwnd, win32con.WM_COMMAND, cmd, 0)
                if count > 1:
                    time.sleep(0.05)
            return True
        return False

    def set_volume(self, percent):
        """Sets volume to a specific percentage (0-100)."""
        if not self.hwnd:
            self.hwnd = self._find_winamp()
        if self.hwnd:
            percent = max(0, min(100, percent))
            # Use round() instead of int() to avoid the "1% off" display error
            win_vol = int(round((percent / 100) * 255))
            win32api.SendMessage(
                self.hwnd, win32con.WM_USER, win_vol, self.IPC_GETSET_VOLUME
            )
            return True
        return False

    def get_volume(self):
        """Returns the current volume percentage."""
        if not self.hwnd:
            self.hwnd = self._find_winamp()
        if self.hwnd:
            val = win32api.SendMessage(
                self.hwnd, win32con.WM_USER, -666, self.IPC_GETSET_VOLUME
            )
            return int((val / 255) * 100)
        return None

    def play_file(self, file_path):
        if not self.hwnd:
            self.hwnd = self._find_winamp()
        if self.hwnd:
            win32api.SendMessage(self.hwnd, win32con.WM_USER, 0, 101)  # Clear
            os.startfile(os.path.abspath(file_path))
            return True
        return False

    COMMAND_MAP = {
        "PLAY": 40045,
        "PAUSE": 40046,
        "STOP": 40047,
        "NEXT": 40048,
        "PREV": 40044,
        "VUP": 40058,
        "VDOWN": 40059,
        "VOL": None,
        "GETVOL": None,  # Special handling
        "LAUNCH": None,  # Launch Winamp if not running
    }


def main():
    parser = argparse.ArgumentParser(description="Winamp CLI")
    parser.add_argument(
        "action", type=str.upper, choices=WinampController.COMMAND_MAP.keys()
    )
    parser.add_argument("extra", nargs="?", default="1")

    args = parser.parse_args()
    player = WinampController()

    # Ensure Winamp is running for all commands except LAUNCH
    if args.action != "LAUNCH":
        if not player.is_running():
            if not player.launch():
                print("Error: Could not find or launch Winamp.")
                sys.exit(1)

    # Handle LAUNCH command
    if args.action == "LAUNCH":
        if player.is_running():
            print("Winamp is already running.")
        else:
            if player.launch():
                print("Winamp launched successfully.")
            else:
                print("Error: Could not find or launch Winamp.")
                sys.exit(1)
        sys.exit(0)

    # 1. Handle Volume Set (e.g., "vol 10%")
    if args.action == "VOL":
        clean_val = args.extra.replace("%", "")
        if clean_val.isdigit():
            percent = int(clean_val)
            player.set_volume(percent)
            print(f"Volume set to {percent}%")
        else:
            print("Error: Provide a number for volume (e.g., 50 or 50%)")

    # 2. Handle Volume Get
    elif args.action == "GETVOL":
        vol = player.get_volume()
        print(f"Current Volume: {vol}%")

    # 3. Handle Play File
    elif args.action == "PLAY" and not args.extra.isdigit() and "." in args.extra:
        if os.path.exists(args.extra):
            player.play_file(args.extra)
            print(f"Playing: {args.extra}")
        else:
            print(f"File not found: {args.extra}")

    # 4. Handle Standard Commands (including repeat counts)
    else:
        cmd_id = WinampController.COMMAND_MAP[args.action]
        count = int(args.extra) if args.extra.isdigit() else 1
        player.send_command(cmd_id, count)
        print(f"Sent {args.action} {f'({count} times)' if count > 1 else ''}")


if __name__ == "__main__":
    main()
