// Vite "?url" imports resolve to the served URL of the asset.
declare module '*?url' {
  const url: string;
  export default url;
}
