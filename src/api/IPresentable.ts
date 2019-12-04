export interface IPresentable<MUTATION_PAYLOADS> {
  present: Present<MUTATION_PAYLOADS>
}

export type Proposal<MUTATION_PAYLOADS> = MUTATION_PAYLOADS[]

export type Present<MUTATION_PAYLOADS> = (
  proposal: Proposal<MUTATION_PAYLOADS>
) => void
