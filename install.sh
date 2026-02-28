#!/usr/bin/env bash
set -euo pipefail

SOURCE_INPUT="${1:-./build/linux/quicknote}"
SOURCE_PATH="${SOURCE_INPUT#\#file:}"
ICON_INPUT="${2:-./build/qn.png}"
ICON_PATH="${ICON_INPUT#\#file:}"

if [[ "$SOURCE_PATH" != /* ]]; then
  SOURCE_PATH="$PWD/$SOURCE_PATH"
fi

if [[ "$ICON_PATH" != /* ]]; then
  ICON_PATH="$PWD/$ICON_PATH"
fi

if [[ ! -f "$SOURCE_PATH" ]]; then
  echo "Source file not found: $SOURCE_INPUT"
  echo "Usage: ./install.sh [./build/linux/quicknote] [./build/qn.png]"
  exit 1
fi

if [[ ! -f "$ICON_PATH" ]]; then
  echo "Icon file not found: $ICON_INPUT"
  echo "Usage: ./install.sh [./build/linux/quicknote] [./build/qn.png]"
  exit 1
fi

BIN_DIR="$HOME/.local/bin"
TARGET_BIN="$BIN_DIR/quicknote"
DESKTOP_DIR="$HOME/.local/share/applications"
DESKTOP_FILE="$DESKTOP_DIR/quicknote.desktop"

mkdir -p "$BIN_DIR"
mkdir -p "$DESKTOP_DIR"

cp "$SOURCE_PATH" "$TARGET_BIN"
chmod +x "$TARGET_BIN"

echo "Installed binary: $TARGET_BIN"

ensure_path_line='export PATH="$HOME/.local/bin:$PATH"'

append_if_missing() {
  local profile_file="$1"
  if [[ -f "$profile_file" ]]; then
    if ! grep -Fq 'PATH="$HOME/.local/bin:$PATH"' "$profile_file"; then
      printf '\n%s\n' "$ensure_path_line" >> "$profile_file"
      echo "Updated PATH in: $profile_file"
    fi
  else
    printf '%s\n' "$ensure_path_line" > "$profile_file"
    echo "Created profile and updated PATH: $profile_file"
  fi
}

append_if_missing "$HOME/.bashrc"
append_if_missing "$HOME/.zshrc"

if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
  export PATH="$HOME/.local/bin:$PATH"
fi

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=QuickNote
Comment=QuickNote desktop app
Exec=$TARGET_BIN
Icon=$ICON_PATH
Terminal=false
Categories=Utility;TextEditor;
StartupNotify=true
EOF

echo "Created desktop entry: $DESKTOP_FILE"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
fi

if command -v xdg-desktop-menu >/dev/null 2>&1; then
  xdg-desktop-menu forceupdate >/dev/null 2>&1 || true
fi

if command -v gtk-launch >/dev/null 2>&1; then
  gtk-launch quicknote >/dev/null 2>&1 || nohup "$TARGET_BIN" >/dev/null 2>&1 &
else
  nohup "$TARGET_BIN" >/dev/null 2>&1 &
fi

echo "QuickNote installed and launched."
