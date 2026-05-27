export async function loadShaderSource(path: string) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Unable to load shader: ${path}`);
  }

  return response.text();
}
