precision mediump float;

uniform sampler2D u_texture;
uniform vec2 u_textureTexelSize;
uniform int u_blurRegionCount;
uniform vec4 u_blurRegionBounds[4];
uniform mat3 u_blurRegionInverseMatrix[4];
uniform float u_blurRegionRadius[4];
uniform vec2 u_blurRegionSize[4];
uniform vec4 u_viewport;
uniform float u_zoom;

varying vec2 v_texCoord;

vec4 sampleBlurred(float radius) {
  vec2 stepSize = u_textureTexelSize * radius;
  vec4 color = texture2D(u_texture, v_texCoord) * 0.16;

  color += texture2D(u_texture, v_texCoord + vec2(stepSize.x * 0.25, 0.0)) * 0.105;
  color += texture2D(u_texture, v_texCoord - vec2(stepSize.x * 0.25, 0.0)) * 0.105;
  color += texture2D(u_texture, v_texCoord + vec2(0.0, stepSize.y * 0.25)) * 0.105;
  color += texture2D(u_texture, v_texCoord - vec2(0.0, stepSize.y * 0.25)) * 0.105;

  color += texture2D(u_texture, v_texCoord + vec2(stepSize.x * 0.55, 0.0)) * 0.065;
  color += texture2D(u_texture, v_texCoord - vec2(stepSize.x * 0.55, 0.0)) * 0.065;
  color += texture2D(u_texture, v_texCoord + vec2(0.0, stepSize.y * 0.55)) * 0.065;
  color += texture2D(u_texture, v_texCoord - vec2(0.0, stepSize.y * 0.55)) * 0.065;

  color += texture2D(u_texture, v_texCoord + stepSize * vec2(0.4, 0.4)) * 0.04;
  color += texture2D(u_texture, v_texCoord + stepSize * vec2(-0.4, 0.4)) * 0.04;
  color += texture2D(u_texture, v_texCoord + stepSize * vec2(0.4, -0.4)) * 0.04;
  color += texture2D(u_texture, v_texCoord + stepSize * vec2(-0.4, -0.4)) * 0.04;

  return color;
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

void main() {
  vec4 color = texture2D(u_texture, v_texCoord);

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
    vec3 localPosition =
      u_blurRegionInverseMatrix[index] * vec3(texCoordToWorld(v_texCoord), 1.0);
    vec2 size = u_blurRegionSize[index];
    bool inside =
      broadInside &&
      localPosition.x >= 0.0 &&
      localPosition.x <= size.x &&
      localPosition.y >= 0.0 &&
      localPosition.y <= size.y;

    if (inside) {
      color = sampleBlurred(u_blurRegionRadius[index]);
    }
  }

  gl_FragColor = color;
}
