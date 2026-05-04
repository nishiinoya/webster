import type { Imported3DModel } from "../../import3d/Imported3DModel";
import type { Object3DKind } from "../../layers/Layer";
import { ShaderProgram } from "../shaders/ShaderProgram";
import type { Object3DShaderProgram } from "../shaders/Object3DShaderProgram";

type Object3DDrawableProgram = ShaderProgram &
  Pick<
    Object3DShaderProgram,
    | "colorAttributeLocation"
    | "normalAttributeLocation"
    | "tangentAttributeLocation"
    | "texCoordAttributeLocation"
  >;

type MeshSubmeshRange = {
  firstVertex: number;
  materialName: string | null;
  vertexCount: number;
};

type MeshArrays = {
  colors: Float32Array;
  normals: Float32Array;
  submeshes: MeshSubmeshRange[];
  tangents: Float32Array;
  texCoords: Float32Array;
  vertices: Float32Array;
};

type ObjFaceVertex = {
  normalIndex: number | null;
  positionIndex: number;
  texCoordIndex: number | null;
};

/**
 * WebGL mesh for built-in and imported 3D objects.
 *
 * Imported OBJ models are split into submesh ranges by `usemtl`,
 * so the renderer can bind a different material/texture before each draw call.
 */
export class Object3DMesh {
  private readonly normalBuffer: WebGLBuffer;
  private readonly colorBuffer: WebGLBuffer;
  private readonly submeshes: MeshSubmeshRange[];
  private readonly tangentBuffer: WebGLBuffer;
  private readonly texCoordBuffer: WebGLBuffer;
  private readonly vertexBuffer: WebGLBuffer;
  private readonly vertexCount: number;

  constructor(
    private readonly gl: WebGLRenderingContext,
    arrays: MeshArrays
  ) {
    const normalBuffer = gl.createBuffer();
    const colorBuffer = gl.createBuffer();
    const tangentBuffer = gl.createBuffer();
    const texCoordBuffer = gl.createBuffer();
    const vertexBuffer = gl.createBuffer();

    if (!normalBuffer || !colorBuffer || !tangentBuffer || !texCoordBuffer || !vertexBuffer) {
      throw new Error("Unable to create 3D mesh buffers.");
    }

    this.colorBuffer = colorBuffer;
    this.normalBuffer = normalBuffer;
    this.tangentBuffer = tangentBuffer;
    this.texCoordBuffer = texCoordBuffer;
    this.vertexBuffer = vertexBuffer;
    this.vertexCount = arrays.vertices.length / 3;
    this.submeshes =
      arrays.submeshes.length > 0
        ? arrays.submeshes
        : [
            {
              firstVertex: 0,
              materialName: null,
              vertexCount: this.vertexCount
            }
          ];

    this.uploadBuffer(this.vertexBuffer, arrays.vertices);
    this.uploadBuffer(this.normalBuffer, arrays.normals);
    this.uploadBuffer(this.tangentBuffer, arrays.tangents);
    this.uploadBuffer(this.texCoordBuffer, arrays.texCoords);
    this.uploadBuffer(this.colorBuffer, arrays.colors);
  }

  draw(
    program: Object3DDrawableProgram,
    options: {
      beforeSubmesh?: (materialName: string | null) => void;
    } = {}
  ) {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.enableVertexAttribArray(program.positionAttributeLocation);
    this.gl.vertexAttribPointer(
      program.positionAttributeLocation,
      3,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.normalBuffer);
    this.gl.enableVertexAttribArray(program.normalAttributeLocation);
    this.gl.vertexAttribPointer(
      program.normalAttributeLocation,
      3,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.texCoordBuffer);
    this.gl.enableVertexAttribArray(program.texCoordAttributeLocation);
    this.gl.vertexAttribPointer(
      program.texCoordAttributeLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.tangentBuffer);
    this.gl.enableVertexAttribArray(program.tangentAttributeLocation);
    this.gl.vertexAttribPointer(
      program.tangentAttributeLocation,
      3,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.colorBuffer);
    this.gl.enableVertexAttribArray(program.colorAttributeLocation);
    this.gl.vertexAttribPointer(
      program.colorAttributeLocation,
      4,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    for (const submesh of this.submeshes) {
      options.beforeSubmesh?.(submesh.materialName);
      this.gl.drawArrays(this.gl.TRIANGLES, submesh.firstVertex, submesh.vertexCount);
    }
  }

  dispose() {
    this.gl.deleteBuffer(this.colorBuffer);
    this.gl.deleteBuffer(this.normalBuffer);
    this.gl.deleteBuffer(this.tangentBuffer);
    this.gl.deleteBuffer(this.texCoordBuffer);
    this.gl.deleteBuffer(this.vertexBuffer);
  }

  private uploadBuffer(buffer: WebGLBuffer, data: Float32Array) {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.STATIC_DRAW);
  }
}

export function createObject3DMesh(
  gl: WebGLRenderingContext,
  kind: Object3DKind,
  source?: string | null,
  importedModel?: Imported3DModel | null
) {
  return new Object3DMesh(gl, createObject3DMeshArrays(kind, source, importedModel));
}

function createObject3DMeshArrays(
  kind: Object3DKind,
  source?: string | null,
  importedModel?: Imported3DModel | null
): MeshArrays {
  if (kind === "imported" && importedModel) {
    return createImportedModelMeshArrays(importedModel);
  }

  if (kind === "imported" && source) {
    return createObjMeshArrays(source);
  }

  if (kind === "sphere") {
    return createSphereMeshArrays();
  }

  if (kind === "pyramid") {
    return createPyramidMeshArrays();
  }

  return createCubeMeshArrays();
}

function createImportedModelMeshArrays(model: Imported3DModel): MeshArrays {
  const vertices: number[] = [];
  const normals: number[] = [];
  const texCoords: number[] = [];
  const tangents: number[] = [];
  const colors: number[] = [];
  const submeshes: MeshSubmeshRange[] = [];

  for (const part of model.parts) {
    const firstVertex = vertices.length / 3;
    const vertexCount = part.vertices.length / 3;

    appendFloatArray(vertices, part.vertices);
    appendFloatArray(normals, part.normals);
    appendFloatArray(texCoords, part.texCoords);

    if (part.tangents && part.tangents.length === vertexCount * 3) {
      appendFloatArray(tangents, part.tangents);
    } else {
      for (let index = 0; index < vertexCount; index += 1) {
        tangents.push(1, 0, 0);
      }
    }

    if (part.colors && part.colors.length === vertexCount * 4) {
      appendFloatArray(colors, part.colors);
    } else {
      for (let index = 0; index < vertexCount; index += 1) {
        colors.push(1, 1, 1, 1);
      }
    }

    submeshes.push({
      firstVertex,
      materialName: part.materialName,
      vertexCount
    });
  }

  return {
    colors: new Float32Array(colors),
    normals: new Float32Array(normals),
    submeshes,
    tangents: new Float32Array(tangents),
    texCoords: new Float32Array(texCoords),
    vertices: new Float32Array(vertices)
  };
}

function appendFloatArray(target: number[], source: Float32Array) {
  for (let index = 0; index < source.length; index += 1) {
    target.push(source[index]);
  }
}

function createObjMeshArrays(source: string): MeshArrays {
  const sourcePositions: number[][] = [];
  const sourceNormals: number[][] = [];
  const sourceTexCoords: number[][] = [];

  const vertices: number[] = [];
  const normals: number[] = [];
  const texCoords: number[] = [];
  const submeshes: MeshSubmeshRange[] = [];

  let currentMaterialName: string | null = null;
  let currentSubmeshStart = 0;
  let hasOpenSubmesh = false;

  function closeSubmesh() {
    if (!hasOpenSubmesh) {
      return;
    }

    const currentVertexCount = vertices.length / 3;
    const vertexCount = currentVertexCount - currentSubmeshStart;

    if (vertexCount > 0) {
      submeshes.push({
        firstVertex: currentSubmeshStart,
        materialName: currentMaterialName,
        vertexCount
      });
    }

    hasOpenSubmesh = false;
  }

  function openSubmesh(materialName: string | null) {
    closeSubmesh();
    currentMaterialName = materialName;
    currentSubmeshStart = vertices.length / 3;
    hasOpenSubmesh = true;
  }

  function ensureSubmesh() {
    if (!hasOpenSubmesh) {
      openSubmesh(currentMaterialName);
    }
  }

  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.split("#")[0].trim();

    if (!line) {
      continue;
    }

    const [rawKeyword, ...values] = line.split(/\s+/u);
    const keyword = rawKeyword.toLowerCase();

    if (keyword === "v" && values.length >= 3) {
      const position = values.slice(0, 3).map(Number);

      if (position.every(Number.isFinite)) {
        sourcePositions.push(position);
      }

      continue;
    }

    if (keyword === "vn" && values.length >= 3) {
      const normal = normalize(values.slice(0, 3).map(Number));

      if (normal.every(Number.isFinite)) {
        sourceNormals.push(normal);
      }

      continue;
    }

    if (keyword === "vt" && values.length >= 2) {
      const texCoord = values.slice(0, 2).map(Number);

      if (texCoord.every(Number.isFinite)) {
        // OBJ UVs often need V flipped for WebGL image textures.
        // If textures appear upside down, change this to:
        // sourceTexCoords.push([texCoord[0], texCoord[1]]);
        sourceTexCoords.push([texCoord[0], 1 - texCoord[1]]);
      }

      continue;
    }

    if (keyword === "usemtl") {
      const materialName = stripAssetReferenceQuotes(line.slice(rawKeyword.length).trim());
      openSubmesh(materialName || null);
      continue;
    }

    if (keyword !== "f" || values.length < 3) {
      continue;
    }

    const face = values
      .map((value) =>
        parseObjFaceVertex(
          value,
          sourcePositions.length,
          sourceTexCoords.length,
          sourceNormals.length
        )
      )
      .filter((vertex): vertex is ObjFaceVertex => Boolean(vertex));

    if (face.length < 3) {
      continue;
    }

    ensureSubmesh();

    // Fan triangulation:
    // f a b c d -> a b c, a c d
    for (let index = 1; index < face.length - 1; index += 1) {
      pushObjTriangle(
        vertices,
        normals,
        texCoords,
        [face[0], face[index], face[index + 1]],
        sourcePositions,
        sourceTexCoords,
        sourceNormals
      );
    }
  }

  closeSubmesh();

  if (vertices.length < 9) {
    return createCubeMeshArrays();
  }

  normalizeImportedVertices(vertices);

  return toMeshArrays(vertices, normals, texCoords, submeshes);
}

function createCubeMeshArrays(): MeshArrays {
  const faces = [
    {
      normal: [0, 0, 1],
      points: [
        [-1, -1, 1],
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1]
      ]
    },
    {
      normal: [0, 0, -1],
      points: [
        [1, -1, -1],
        [-1, -1, -1],
        [-1, 1, -1],
        [1, 1, -1]
      ]
    },
    {
      normal: [1, 0, 0],
      points: [
        [1, -1, 1],
        [1, -1, -1],
        [1, 1, -1],
        [1, 1, 1]
      ]
    },
    {
      normal: [-1, 0, 0],
      points: [
        [-1, -1, -1],
        [-1, -1, 1],
        [-1, 1, 1],
        [-1, 1, -1]
      ]
    },
    {
      normal: [0, 1, 0],
      points: [
        [-1, 1, 1],
        [1, 1, 1],
        [1, 1, -1],
        [-1, 1, -1]
      ]
    },
    {
      normal: [0, -1, 0],
      points: [
        [-1, -1, -1],
        [1, -1, -1],
        [1, -1, 1],
        [-1, -1, 1]
      ]
    }
  ];

  const vertices: number[] = [];
  const normals: number[] = [];
  const texCoords: number[] = [];

  for (const face of faces) {
    pushFace(vertices, normals, texCoords, face.points, face.normal);
  }

  return toMeshArrays(vertices, normals, texCoords, [
    {
      firstVertex: 0,
      materialName: null,
      vertexCount: vertices.length / 3
    }
  ]);
}

function createPyramidMeshArrays(): MeshArrays {
  const vertices: number[] = [];
  const normals: number[] = [];
  const texCoords: number[] = [];

  const apex = [0, 1.25, 0];
  const base = [
    [-1, -1, 1],
    [1, -1, 1],
    [1, -1, -1],
    [-1, -1, -1]
  ];

  pushFace(vertices, normals, texCoords, [base[0], base[1], base[2], base[3]], [0, -1, 0]);

  for (let index = 0; index < base.length; index += 1) {
    const nextIndex = (index + 1) % base.length;
    const triangle = [base[index], base[nextIndex], apex];
    const normal = getFaceNormal(triangle[0], triangle[1], triangle[2]);

    pushTriangle(vertices, normals, texCoords, triangle, normal, [
      [0, 0],
      [1, 0],
      [0.5, 1]
    ]);
  }

  return toMeshArrays(vertices, normals, texCoords, [
    {
      firstVertex: 0,
      materialName: null,
      vertexCount: vertices.length / 3
    }
  ]);
}

function createSphereMeshArrays(): MeshArrays {
  const vertices: number[] = [];
  const normals: number[] = [];
  const texCoords: number[] = [];

  const rows = 16;
  const columns = 32;

  for (let row = 0; row < rows; row += 1) {
    const v0 = row / rows;
    const v1 = (row + 1) / rows;
    const theta0 = v0 * Math.PI;
    const theta1 = v1 * Math.PI;

    for (let column = 0; column < columns; column += 1) {
      const u0 = column / columns;
      const u1 = (column + 1) / columns;
      const phi0 = u0 * Math.PI * 2;
      const phi1 = u1 * Math.PI * 2;

      const p00 = sphericalPoint(theta0, phi0);
      const p10 = sphericalPoint(theta0, phi1);
      const p01 = sphericalPoint(theta1, phi0);
      const p11 = sphericalPoint(theta1, phi1);

      pushTriangle(vertices, normals, texCoords, [p00, p01, p10], [p00, p01, p10], [
        [u0, 1 - v0],
        [u0, 1 - v1],
        [u1, 1 - v0]
      ]);

      pushTriangle(vertices, normals, texCoords, [p10, p01, p11], [p10, p01, p11], [
        [u1, 1 - v0],
        [u0, 1 - v1],
        [u1, 1 - v1]
      ]);
    }
  }

  return toMeshArrays(vertices, normals, texCoords, [
    {
      firstVertex: 0,
      materialName: null,
      vertexCount: vertices.length / 3
    }
  ]);
}

function pushFace(
  vertices: number[],
  normals: number[],
  texCoords: number[],
  points: number[][],
  normal: number[]
) {
  pushTriangle(vertices, normals, texCoords, [points[0], points[1], points[2]], normal, [
    [0, 0],
    [1, 0],
    [1, 1]
  ]);

  pushTriangle(vertices, normals, texCoords, [points[0], points[2], points[3]], normal, [
    [0, 0],
    [1, 1],
    [0, 1]
  ]);
}

function pushTriangle(
  vertices: number[],
  normals: number[],
  texCoords: number[],
  points: number[][],
  normalOrNormals: number[] | number[][],
  uvs: number[][]
) {
  for (let index = 0; index < 3; index += 1) {
    const point = points[index];
    const normal = Array.isArray(normalOrNormals[0])
      ? (normalOrNormals as number[][])[index]
      : (normalOrNormals as number[]);
    const uv = uvs[index];

    vertices.push(point[0], point[1], point[2]);
    normals.push(normal[0], normal[1], normal[2]);
    texCoords.push(uv[0], uv[1]);
  }
}

function pushObjTriangle(
  vertices: number[],
  normals: number[],
  texCoords: number[],
  face: ObjFaceVertex[],
  sourcePositions: number[][],
  sourceTexCoords: number[][],
  sourceNormals: number[][]
) {
  const p0 = sourcePositions[face[0].positionIndex];
  const p1 = sourcePositions[face[1].positionIndex];
  const p2 = sourcePositions[face[2].positionIndex];

  if (!p0 || !p1 || !p2) {
    return;
  }

  const faceNormal = getFaceNormal(p0, p1, p2);

  for (let index = 0; index < 3; index += 1) {
    const vertex = face[index];
    const position = sourcePositions[vertex.positionIndex];

    if (!position) {
      return;
    }

    const normal =
      vertex.normalIndex === null
        ? faceNormal
        : sourceNormals[vertex.normalIndex] ?? faceNormal;

    const texCoord =
      vertex.texCoordIndex === null
        ? getFallbackObjTexCoord(index)
        : sourceTexCoords[vertex.texCoordIndex] ?? getFallbackObjTexCoord(index);

    vertices.push(position[0], position[1], position[2]);
    normals.push(normal[0], normal[1], normal[2]);
    texCoords.push(texCoord[0], texCoord[1]);
  }
}

function parseObjFaceVertex(
  token: string,
  positionCount: number,
  texCoordCount: number,
  normalCount: number
): ObjFaceVertex | null {
  const [positionRaw, texCoordRaw, normalRaw] = token.split("/");
  const positionIndex = resolveObjIndex(positionRaw, positionCount);

  if (positionIndex === null) {
    return null;
  }

  return {
    normalIndex: normalRaw ? resolveObjIndex(normalRaw, normalCount) : null,
    positionIndex,
    texCoordIndex: texCoordRaw ? resolveObjIndex(texCoordRaw, texCoordCount) : null
  };
}

function resolveObjIndex(value: string | undefined, count: number) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed === 0) {
    return null;
  }

  // OBJ indices are 1-based.
  // Negative indices are relative to the current list end.
  const index = parsed > 0 ? parsed - 1 : count + parsed;

  return index >= 0 && index < count ? index : null;
}

function getFallbackObjTexCoord(index: number) {
  switch (index) {
    case 1:
      return [1, 0];
    case 2:
      return [0.5, 1];
    default:
      return [0, 0];
  }
}

function normalizeImportedVertices(vertices: number[]) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < vertices.length; index += 3) {
    minX = Math.min(minX, vertices[index]);
    minY = Math.min(minY, vertices[index + 1]);
    minZ = Math.min(minZ, vertices[index + 2]);

    maxX = Math.max(maxX, vertices[index]);
    maxY = Math.max(maxY, vertices[index + 1]);
    maxZ = Math.max(maxZ, vertices[index + 2]);
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;

  const largestSide = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);
  const scale = 2 / largestSide;

  for (let index = 0; index < vertices.length; index += 3) {
    vertices[index] = (vertices[index] - centerX) * scale;
    vertices[index + 1] = (vertices[index + 1] - centerY) * scale;
    vertices[index + 2] = (vertices[index + 2] - centerZ) * scale;
  }
}

function sphericalPoint(theta: number, phi: number) {
  return [
    Math.sin(theta) * Math.cos(phi),
    Math.cos(theta),
    Math.sin(theta) * Math.sin(phi)
  ];
}

function getFaceNormal(a: number[], b: number[], c: number[]) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];

  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];

  return normalize([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]);
}

function normalize(vector: number[]) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;

  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function toMeshArrays(
  vertices: number[],
  normals: number[],
  texCoords: number[],
  submeshes: MeshSubmeshRange[]
): MeshArrays {
  return {
    colors: createDefaultColors(vertices.length / 3),
    normals: new Float32Array(normals),
    submeshes,
    tangents: createDefaultTangents(vertices.length / 3),
    texCoords: new Float32Array(texCoords),
    vertices: new Float32Array(vertices)
  };
}

function createDefaultTangents(vertexCount: number) {
  const tangents = new Float32Array(vertexCount * 3);

  for (let index = 0; index < vertexCount; index += 1) {
    tangents[index * 3] = 1;
  }

  return tangents;
}

function createDefaultColors(vertexCount: number) {
  const colors = new Float32Array(vertexCount * 4);

  for (let index = 0; index < vertexCount; index += 1) {
    colors[index * 4] = 1;
    colors[index * 4 + 1] = 1;
    colors[index * 4 + 2] = 1;
    colors[index * 4 + 3] = 1;
  }

  return colors;
}

function stripAssetReferenceQuotes(reference: string) {
  return reference.trim().replace(/^["']|["']$/gu, "");
}
