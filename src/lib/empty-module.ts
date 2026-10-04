// Stand-in for Node built-ins (fs, path, crypto) in the browser bundle. OpenCV.js only requires
// them inside its `ENVIRONMENT_HAS_NODE` branch, which never runs in a browser. See next.config.ts.
export {};
