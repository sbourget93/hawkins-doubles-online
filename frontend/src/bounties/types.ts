/** Domain types for the bounty aggregate (a prize anyone can win). */

export interface Bounty {
  bounty_id: string
  name: string
  prize: string
}

/** The full set of admin-editable bounty fields (used by add and edit). */
export interface BountyFields {
  name: string
  prize: string
}

export interface BountiesResponse {
  version: number
  bounties: Bounty[]
}
