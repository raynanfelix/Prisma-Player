// Global type declarations for React 19 compatibility
// Fixes "Cannot find namespace 'JSX'" error with @dnd-kit/core and React 19

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}