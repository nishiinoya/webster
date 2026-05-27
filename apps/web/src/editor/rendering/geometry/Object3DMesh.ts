import type { Imported3DModel } from "../../import3d/Imported3DModel";
import type { Object3DKind } from "../../layers/Layer";
import type { Object3DLayer } from "../../layers/Object3DLayer";
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
  firstIndex: number;
  firstVertex: number;
  indexCount: number;
  materialName: string | null;
  vertexCount: number;
};

type MeshArrays = {
  colors: Float32Array;
  indices: Uint16Array | Uint32Array | null;
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

const importedModelCacheKeys = new WeakMap<Imported3DModel, string>();

export class Object3DMesh {
  private readonly colorBuffer: WebGLBuffer;
  private readonly indexBuffer: WebGLBuffer | null;
  private readonly indexType: number | null;
  private readonly normalBuffer: WebGLBuffer;
  private readonly submeshes: MeshSubmeshRange[];
  private readonly tangentBuffer: WebGLBuffer;
  private readonly texCoordBuffer: WebGLBuffer;
  private readonly vertexBuffer: WebGLBuffer;
  private readonly vertexCount: number;

  constructor(
    private readonly gl: WebGLRenderingContext,
    arrays: MeshArrays
  ) {
    const canUseUint32Indices = Boolean(gl.getExtension("OES_element_index_uint"));
    const preparedArrays =
      arrays.indices instanceof Uint32Array && !canUseUint32Indices
        ? flattenIndexedMeshArrays(arrays)
        : arrays;
    const normalBuffer = gl.createBuffer();
    const colorBuffer = gl.createBuffer();
    const tangentBuffer = gl.createBuffer();
    const texCoordBuffer = gl.createBuffer();
    const vertexBuffer = gl.createBuffer();
    const indexBuffer = preparedArrays.indices ? gl.createBuffer() : null;

    if (
      !normalBuffer ||
      !colorBuffer ||
      !tangentBuffer ||
      !texCoordBuffer ||
      !vertexBuffer ||
      (preparedArrays.indices && !indexBuffer)
    ) {
      throw new Error("Unable to create 3D mesh buffers.");
    }

    this.colorBuffer = colorBuffer;
    this.indexBuffer = indexBuffer;
    this.indexType =
      preparedArrays.indices instanceof Uint32Array
        ? gl.UNSIGNED_INT
        : preparedArrays.indices
          ? gl.UNSIGNED_SHORT
          : null;
    this.normalBuffer = normalBuffer;
    this.submeshes =
      preparedArrays.submeshes.length > 0
        ? preparedArrays.submeshes
        : [
            {
              firstIndex: 0,
              firstVertex: 0,
              indexCount: preparedArrays.indices?.length ?? 0,
              materialName: null,
              vertexCount: preparedArrays.vertices.length / 3
            }
          ];
    this.tangentBuffer = tangentBuffer;
    this.texCoordBuffer = texCoordBuffer;
    this.vertexBuffer = vertexBuffer;
    this.vertexCount = preparedArrays.vertices.length / 3;

    this.uploadFloatBuffer(this.vertexBuffer, preparedArrays.vertices);
    this.uploadFloatBuffer(this.normalBuffer, preparedArrays.normals);
    this.uploadFloatBuffer(this.tangentBuffer, preparedArrays.tangents);
    this.uploadFloatBuffer(this.texCoordBuffer, preparedArrays.texCoords);
    this.uploadFloatBuffer(this.colorBuffer, preparedArrays.colors);

    if (this.indexBuffer && preparedArrays.indices) {
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, preparedArrays.indices, this.gl.STATIC_DRAW);
    }
  }

  draw(
    program: Object3DDrawableProgram,
    options: {
      beforeSubmesh?: (materialName: string | null) => void;
    } = {}
  ) {
    this.bindAttributes(program);

    if (this.indexBuffer && this.indexType !== null) {
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

      for (const submesh of this.submeshes) {
        options.beforeSubmesh?.(submesh.materialName);
        this.gl.drawElements(
          this.gl.TRIANGLES,
          submesh.indexCount,
          this.indexType,
          submesh.firstIndex * getIndexElementSize(this.indexType, this.gl)
        );
      }

      return;
    }

    for (const submesh of this.submeshes) {
      options.beforeSubmesh?.(submesh.materialName);
      this.gl.drawArrays(this.gl.TRIANGLES, submesh.firstVertex, submesh.vertexCount);
    }
  }

  dispose() {
    this.resetVertexAttributes();

    this.gl.deleteBuffer(this.colorBuffer);

    if (this.indexBuffer) {
      this.gl.deleteBuffer(this.indexBuffer);
    }

    this.gl.deleteBuffer(this.normalBuffer);
    this.gl.deleteBuffer(this.tangentBuffer);
    this.gl.deleteBuffer(this.texCoordBuffer);
    this.gl.deleteBuffer(this.vertexBuffer);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
  }

  private resetVertexAttributes() {
    const attributeCount = this.gl.getParameter(this.gl.MAX_VERTEX_ATTRIBS) as number;

    for (let index = 0; index < attributeCount; index += 1) {
      this.gl.disableVertexAttribArray(index);
    }
  }

  private bindAttributes(program: Object3DDrawableProgram) {
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
  }

  private uploadFloatBuffer(buffer: WebGLBuffer, data: Float32Array) {
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

export function getObject3DMeshCacheKey(layer: Object3DLayer) {
  if (layer.objectKind !== "imported") {
    return `builtin:${layer.objectKind}`;
  }

  if (layer.importedModel) {
    return `imported-model:${getImportedModelCacheKey(layer.importedModel)}`;
  }

  if (layer.modelSource) {
    return `legacy-obj:${hashString(layer.modelSource)}`;
  }

  return "builtin:cube";
}

function getImportedModelCacheKey(model: Imported3DModel) {
  const cachedKey = importedModelCacheKeys.get(model);

  if (cachedKey) {
    return cachedKey;
  }

  const key =
    model.id ||
    `${model.sourceFormat}:${model.name}:${model.stats.vertexCount}:${model.stats.triangleCount}:${model.parts.length}`;

  importedModelCacheKeys.set(model, key);

  return key;
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
  const indices: number[] = [];
  const submeshes: MeshSubmeshRange[] = [];
  let maxIndex = 0;

  for (const part of model.parts) {
    const firstIndex = indices.length;
    const firstVertex = vertices.length / 3;
    const vertexCount = part.vertices.length / 3;
    const partIndices = part.indices ?? createSequentialIndices(vertexCount);

    appendFloatArray(vertices, part.vertices);
    appendFloatArray(normals, part.normals);
    appendFloatArray(texCoords, part.texCoords);

    if (part.tangents && part.tangents.length === vertexCount * 3) {
      appendFloatArray(tangents, part.tangents);
    } else {
      appendDefaultTangents(tangents, vertexCount);
    }

    if (part.colors && part.colors.length === vertexCount * 4) {
      appendFloatArray(colors, part.colors);
    } else {
      appendDefaultColors(colors, vertexCount);
    }

    for (let index = 0; index < partIndices.length; index += 1) {
      const nextIndex = firstVertex + partIndices[index];

      indices.push(nextIndex);
      maxIndex = Math.max(maxIndex, nextIndex);
    }

    submeshes.push({
      firstIndex,
      firstVertex,
      indexCount: partIndices.length,
      materialName: part.materialName,
      vertexCount
    });
  }

  return {
    colors: new Float32Array(colors),
    indices: createIndexArray(indices, maxIndex),
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

function appendDefaultTangents(target: number[], vertexCount: number) {
  for (let index = 0; index < vertexCount; index += 1) {
    target.push(1, 0, 0);
  }
}

function appendDefaultColors(target: number[], vertexCount: number) {
  for (let index = 0; index < vertexCount; index += 1) {
    target.push(1, 1, 1, 1);
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
        firstIndex: currentSubmeshStart,
        firstVertex: currentSubmeshStart,
        indexCount: vertexCount,
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
  const positions = [
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
    [1, -1, -1],
    [-1, -1, -1],
    [-1, 1, -1],
    [1, 1, -1],
    [1, -1, 1],
    [1, -1, -1],
    [1, 1, -1],
    [1, 1, 1],
    [-1, -1, -1],
    [-1, -1, 1],
    [-1, 1, 1],
    [-1, 1, -1],
    [-1, 1, 1],
    [1, 1, 1],
    [1, 1, -1],
    [-1, 1, -1],
    [-1, -1, -1],
    [1, -1, -1],
    [1, -1, 1],
    [-1, -1, 1]
  ];
  const normalsByFace = [
    [0, 0, 1],
    [0, 0, -1],
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0]
  ];
  const indices = [
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
    8, 9, 10, 8, 10, 11,
    12, 13, 14, 12, 14, 15,
    16, 17, 18, 16, 18, 19,
    20, 21, 22, 20, 22, 23
  ];
  const vertices: number[] = [];
  const normals: number[] = [];
  const texCoords: number[] = [];

  for (const [faceIndex, faceNormal] of normalsByFace.entries()) {
    for (let corner = 0; corner < 4; corner += 1) {
      const point = positions[faceIndex * 4 + corner];
      const uv = getQuadTexCoord(corner);

      vertices.push(point[0], point[1], point[2]);
      normals.push(faceNormal[0], faceNormal[1], faceNormal[2]);
      texCoords.push(uv[0], uv[1]);
    }
  }

  return toIndexedMeshArrays(vertices, normals, texCoords, indices, [
    {
      firstIndex: 0,
      firstVertex: 0,
      indexCount: indices.length,
      materialName: null,
      vertexCount: vertices.length / 3
    }
  ]);
}

function createPyramidMeshArrays(): MeshArrays {
  const vertices: number[] = [];
  const normals: number[] = [];
  const texCoords: number[] = [];
  const indices: number[] = [];

  const apex = [0, 1.25, 0];
  const base = [
    [-1, -1, 1],
    [1, -1, 1],
    [1, -1, -1],
    [-1, -1, -1]
  ];

  pushIndexedFace(vertices, normals, texCoords, indices, [base[0], base[1], base[2], base[3]], [0, -1, 0]);

  for (let index = 0; index < base.length; index += 1) {
    const nextIndex = (index + 1) % base.length;
    const triangle = [base[index], base[nextIndex], apex];
    const normal = getFaceNormal(triangle[0], triangle[1], triangle[2]);

    pushIndexedTriangle(vertices, normals, texCoords, indices, triangle, normal, [
      [0, 0],
      [1, 0],
      [0.5, 1]
    ]);
  }

  return toIndexedMeshArrays(vertices, normals, texCoords, indices, [
    {
      firstIndex: 0,
      firstVertex: 0,
      indexCount: indices.length,
      materialName: null,
      vertexCount: vertices.length / 3
    }
  ]);
}

function createSphereMeshArrays(): MeshArrays {
  const vertices: number[] = [];
  const normals: number[] = [];
  const texCoords: number[] = [];
  const indices: number[] = [];

  const rows = 16;
  const columns = 32;

  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    const theta = v * Math.PI;

    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const phi = u * Math.PI * 2;
      const point = sphericalPoint(theta, phi);

      vertices.push(point[0], point[1], point[2]);
      normals.push(point[0], point[1], point[2]);
      texCoords.push(u, 1 - v);
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const rowStart = row * (columns + 1);
      const nextRowStart = (row + 1) * (columns + 1);
      const p00 = rowStart + column;
      const p10 = rowStart + column + 1;
      const p01 = nextRowStart + column;
      const p11 = nextRowStart + column + 1;

      indices.push(p00, p01, p10, p10, p01, p11);
    }
  }

  return toIndexedMeshArrays(vertices, normals, texCoords, indices, [
    {
      firstIndex: 0,
      firstVertex: 0,
      indexCount: indices.length,
      materialName: null,
      vertexCount: vertices.length / 3
    }
  ]);
}

function pushIndexedFace(
  vertices: number[],
  normals: number[],
  texCoords: number[],
  indices: number[],
  points: number[][],
  normal: number[]
) {
  const start = vertices.length / 3;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const uv = getQuadTexCoord(index);

    vertices.push(point[0], point[1], point[2]);
    normals.push(normal[0], normal[1], normal[2]);
    texCoords.push(uv[0], uv[1]);
  }

  indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
}

function pushIndexedTriangle(
  vertices: number[],
  normals: number[],
  texCoords: number[],
  indices: number[],
  points: number[][],
  normalOrNormals: number[] | number[][],
  uvs: number[][]
) {
  const start = vertices.length / 3;

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

  indices.push(start, start + 1, start + 2);
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
  const vertexCount = vertices.length / 3;
  const indices = createSequentialIndices(vertexCount);

  return {
    colors: createDefaultColors(vertexCount),
    indices,
    normals: new Float32Array(normals),
    submeshes: submeshes.map((submesh) => ({
      ...submesh,
      firstIndex: submesh.firstVertex,
      indexCount: submesh.vertexCount
    })),
    tangents: createDefaultTangents(vertexCount),
    texCoords: new Float32Array(texCoords),
    vertices: new Float32Array(vertices)
  };
}

function toIndexedMeshArrays(
  vertices: number[],
  normals: number[],
  texCoords: number[],
  indices: number[],
  submeshes: MeshSubmeshRange[]
): MeshArrays {
  return {
    colors: createDefaultColors(vertices.length / 3),
    indices: createIndexArray(indices, vertices.length / 3 - 1),
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

function createSequentialIndices(vertexCount: number) {
  const indices = new Array<number>(vertexCount);

  for (let index = 0; index < vertexCount; index += 1) {
    indices[index] = index;
  }

  return createIndexArray(indices, vertexCount - 1);
}

function createIndexArray(indices: number[], maxIndex: number) {
  return maxIndex > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
}

function flattenIndexedMeshArrays(arrays: MeshArrays): MeshArrays {
  if (!arrays.indices) {
    return arrays;
  }

  const vertices = new Float32Array(arrays.indices.length * 3);
  const normals = new Float32Array(arrays.indices.length * 3);
  const tangents = new Float32Array(arrays.indices.length * 3);
  const texCoords = new Float32Array(arrays.indices.length * 2);
  const colors = new Float32Array(arrays.indices.length * 4);

  for (let outputIndex = 0; outputIndex < arrays.indices.length; outputIndex += 1) {
    const sourceIndex = arrays.indices[outputIndex];

    copyComponents(arrays.vertices, vertices, sourceIndex, outputIndex, 3);
    copyComponents(arrays.normals, normals, sourceIndex, outputIndex, 3);
    copyComponents(arrays.tangents, tangents, sourceIndex, outputIndex, 3);
    copyComponents(arrays.texCoords, texCoords, sourceIndex, outputIndex, 2);
    copyComponents(arrays.colors, colors, sourceIndex, outputIndex, 4);
  }

  return {
    colors,
    indices: null,
    normals,
    submeshes: arrays.submeshes.map((submesh) => ({
      ...submesh,
      firstVertex: submesh.firstIndex,
      vertexCount: submesh.indexCount
    })),
    tangents,
    texCoords,
    vertices
  };
}

function copyComponents(
  source: Float32Array,
  target: Float32Array,
  sourceIndex: number,
  targetIndex: number,
  componentCount: number
) {
  for (let component = 0; component < componentCount; component += 1) {
    target[targetIndex * componentCount + component] =
      source[sourceIndex * componentCount + component] ?? 0;
  }
}

function getIndexElementSize(indexType: number, gl: WebGLRenderingContext) {
  return indexType === gl.UNSIGNED_INT ? 4 : 2;
}

function getQuadTexCoord(index: number) {
  switch (index) {
    case 1:
      return [1, 0];
    case 2:
      return [1, 1];
    case 3:
      return [0, 1];
    default:
      return [0, 0];
  }
}

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function stripAssetReferenceQuotes(reference: string) {
  return reference.trim().replace(/^["']|["']$/gu, "");
}
