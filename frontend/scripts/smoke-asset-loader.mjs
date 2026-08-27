const ASSET_EXTENSION = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;

export async function load(url, context, nextLoad) {
  if (!ASSET_EXTENSION.test(new URL(url).pathname)) {
    return nextLoad(url, context);
  }

  return {
    format: "module",
    shortCircuit: true,
    source: `export default ${JSON.stringify(url)};`,
  };
}
