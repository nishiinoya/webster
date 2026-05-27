export function getCanvasCursorStyle(cursor: string) {
  if (cursor.startsWith("mask-brush-")) {
    const [, , sizePart, mode] = cursor.split("-");
    const size = Math.min(Math.max(Number(sizePart) || 24, 6), 96);
    const stroke = mode === "hide" ? "#ffb3b3" : "#dff7f1";
    const radius = size / 2 - 1;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${stroke}" stroke-width="2"/><circle cx="${size / 2}" cy="${size / 2}" r="1.5" fill="${stroke}"/></svg>`;

    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${size / 2} ${size / 2}, crosshair`;
  }

  if (!cursor.startsWith("rotate-")) {
    return cursor;
  }

  const rotation = Number(cursor.slice("rotate-".length));
  const safeRotation = Number.isFinite(rotation) ? rotation : 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g transform="rotate(${safeRotation} 12 12)"><path fill="none" stroke="#eef1f4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M18 7v5h-5M6 17v-5h5M17.2 12a5.8 5.8 0 0 0-9.8-4.2M6.8 12a5.8 5.8 0 0 0 9.8 4.2"/></g></svg>`;

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, grab`;
}
