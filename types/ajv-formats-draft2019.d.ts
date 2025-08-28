declare module 'ajv-formats-draft2019' {
  import type { Ajv } from 'ajv';

  function addFormats(ajv: Ajv): Ajv;
  export default addFormats;
}
