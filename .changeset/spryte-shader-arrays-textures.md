---
"spryte": minor
---

`Shader.set()` takes uniform arrays and textures as well as floats and vectors.

```ts
const fx = draw.createShader(`
  uniform vec4 pool[64];
  uniform sampler2D noise;
  vec4 effect(vec4 color, vec2 uv) { return source(uv) * color * pool[0] * texture(noise, frameUv()).r; }
`);
fx.set("pool", poolValues);                     // Float32Array or number[], packed flat
fx.set("noise", noiseCanvas, { smooth: true }); // image, canvas, ImageBitmap or render target
```

- Arrays set `float`, `vec2`, `vec3` and `vec4` arrays. spryte reads the type from the compiled shader, so 4 numbers on a `float[4]` set the array and on a `vec4` set the vector. A length that isn't a whole number of elements, or is longer than the declared array, throws an error naming the uniform.
- A texture on a `sampler2D` goes on its own texture unit from 8 up, apart from the 8 units sprite batches use, and stays bound for every batch drawn with the shader. Filtering is nearest unless `smooth` is set. A render target reads from its bottom row (`uv.y` runs bottom to top), and a shader can't sample the target it draws into.
- Bad values throw at `set()` while the shader is in use, or when `withShader`, or `into()` with the shader active, would start using them, before anything changes.
- `set()` on a uniform the compiler removed does nothing, as it did for floats and vectors.

Floats and tuples on plain uniforms behave as before. The Canvas 2D fallback still draws without the effect.
