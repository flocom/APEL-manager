/** Décompresseur bzip2 en JavaScript pur, sans déclarations publiées. */
declare module "seek-bzip" {
  export function decode(input: Buffer): Buffer;
}
