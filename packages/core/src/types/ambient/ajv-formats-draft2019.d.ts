// Ambient declaration for ajv-formats-draft2019 (no official @types)
declare module 'ajv-formats-draft2019' {
  import type Ajv from 'ajv';
  const draft2019Formats: (ajv: Ajv) => void;
  export default draft2019Formats;
}
