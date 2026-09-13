import type { Follower, FollowStore, PushSubscriptionInput } from './follow-store'

/**
 * The no-credentials follow store: plain maps in the server process. Fixture
 * mode uses it so the bell, the route and the rig's subscribe path are real;
 * tests use it as the writer behind the route and the send. It forgets
 * everything on restart, which is what a fixture should do.
 */
export class MemoryFollowStore implements FollowStore {
  readonly subscriptions = new Map<string, PushSubscriptionInput>()
  /** endpoint → beach ids */
  readonly follows = new Map<string, Set<string>>()

  async subscribe(subscription: PushSubscriptionInput, beachId: string): Promise<void> {
    this.subscriptions.set(subscription.endpoint, {
      endpoint: subscription.endpoint,
      keys: { ...subscription.keys },
    })
    const set = this.follows.get(subscription.endpoint) ?? new Set<string>()
    set.add(beachId)
    this.follows.set(subscription.endpoint, set)
  }

  async unsubscribe(endpoint: string, beachId: string): Promise<void> {
    const set = this.follows.get(endpoint)
    if (!set) return
    set.delete(beachId)
    if (set.size === 0) await this.remove(endpoint)
  }

  async followersOf(beachIds: readonly string[]): Promise<Follower[]> {
    const wanted = new Set(beachIds)
    const out: Follower[] = []
    for (const [endpoint, set] of this.follows) {
      const subscription = this.subscriptions.get(endpoint)
      if (!subscription) continue
      for (const beachId of set) {
        if (wanted.has(beachId)) out.push({ ...subscription, keys: { ...subscription.keys }, beachId })
      }
    }
    return out
  }

  async remove(endpoint: string): Promise<void> {
    this.subscriptions.delete(endpoint)
    this.follows.delete(endpoint)
  }
}
