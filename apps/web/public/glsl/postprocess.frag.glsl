precision mediump float;

uniform sampler2D u_texture;
uniform vec2 u_textureTexelSize;
uniform int u_blurRegionCount;
uniform vec4 u_blurRegionBounds[4];
uniform mat3 u_blurRegionInverseMatrix[4];
uniform vec4 u_blurRegionLocalBounds[4];
uniform float u_blurRegionRadius[4];
uniform vec4 u_viewport;
uniform float u_zoom;
uniform bool u_clipToBlurRegions;
uniform int u_backgroundMode;
uniform vec4 u_checkerColorA;
uniform vec4 u_checkerColorB;
uniform float u_checkerSize;

varying vec2 v_texCoord;

vec4 samplePremultiplied(vec2 texCoord) {
  vec4 color = texture2D(u_texture, texCoord);

  return vec4(color.rgb * color.a, color.a);
}

vec4 sampleBlurred(float radius) {
  float clampedRadius = min(radius, 64.0);

  if (clampedRadius <= 0.001) {
    return texture2D(u_texture, v_texCoord);
  }

  vec2 stepSize = u_textureTexelSize * clampedRadius * 0.45;
  vec4 color = samplePremultiplied(v_texCoord) * 0.227027;

  color += samplePremultiplied(v_texCoord + vec2(stepSize.x, 0.0)) * 0.1945946;
  color += samplePremultiplied(v_texCoord - vec2(stepSize.x, 0.0)) * 0.1945946;
  color += samplePremultiplied(v_texCoord + vec2(0.0, stepSize.y)) * 0.1216216;
  color += samplePremultiplied(v_texCoord - vec2(0.0, stepSize.y)) * 0.1216216;
  color += samplePremultiplied(v_texCoord + stepSize) * 0.0702703;
  color += samplePremultiplied(v_texCoord - stepSize) * 0.0702703;

  if (color.a <= 0.0001) {
    return vec4(0.0);
  }

  return vec4(color.rgb / color.a, color.a);
}

vec2 texCoordToWorld(vec2 texCoord) {
  float cameraX = u_viewport.x;
  float cameraY = u_viewport.y;
  float viewportWidth = u_viewport.z;
  float viewportHeight = u_viewport.w;
  float zoom = max(u_zoom, 0.0001);
  vec2 screenPoint = vec2(texCoord.x * viewportWidth, (1.0 - texCoord.y) * viewportHeight);

  return vec2(
    (screenPoint.x - viewportWidth * 0.5) / zoom + cameraX,
    (0.5 * viewportHeight - screenPoint.y) / zoom + cameraY
  );
}

vec4 getBackgroundColor(vec2 worldPosition) {
  if (u_backgroundMode == 1) {
    return vec4(1.0);
  }

  if (u_backgroundMode == 2) {
    vec2 checker = floor(worldPosition / u_checkerSize);
    float checkerIndex = mod(checker.x + checker.y, 2.0);

    return mix(u_checkerColorA, u_checkerColorB, checkerIndex);
  }

  return vec4(0.0);
}

void main() {
  vec4 color = texture2D(u_texture, v_texCoord);
  bool matchedRegion = false;
  vec2 worldPosition = texCoordToWorld(v_texCoord);

  for (int index = 0; index < 4; index += 1) {
    if (index >= u_blurRegionCount) {
      break;
    }

    vec4 bounds = u_blurRegionBounds[index];
    bool broadInside =
      v_texCoord.x >= bounds.x &&
      v_texCoord.x <= bounds.x + bounds.z &&
      v_texCoord.y >= bounds.y &&
      v_texCoord.y <= bounds.y + bounds.w;
    vec3 localPosition = u_blurRegionInverseMatrix[index] * vec3(worldPosition, 1.0);
    vec4 localBounds = u_blurRegionLocalBounds[index];
    bool inside =
      broadInside &&
      localPosition.x >= localBounds.x &&
      localPosition.x <= localBounds.x + localBounds.z &&
      localPosition.y >= localBounds.y &&
      localPosition.y <= localBounds.y + localBounds.w;

    if (inside) {
      matchedRegion = true;
      color = sampleBlurred(u_blurRegionRadius[index]);
    }
  }

  if (u_clipToBlurRegions && !matchedRegion) {
    discard;
  }

  if (u_clipToBlurRegions) {
    vec4 background = getBackgroundColor(worldPosition);

    color = vec4(color.rgb + background.rgb * (1.0 - color.a), max(color.a, background.a));
  }

  gl_FragColor = color;
}
