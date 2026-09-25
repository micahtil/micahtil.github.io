export function usageGuideView(isOwner = false) {
  return `<section class="card form-layout">
    <div class="eyebrow muted">October Club guide</div>
    <h2 style="margin-top:12px">How to use the club</h2>
    <p>Track your coffee shop spending from October 1–31, 2026. The lowest cumulative dollar total wins. Everything is in US dollars, with dates based on New York time.</p>
    <div class="rule"><span class="num">01</span><div><h3>Join and set your name</h3><p class="small muted">Ask the organizer to invite you, then sign in with your account from the group’s Slack workspace. In Account, set “Name on the leaderboard” and save it. Your name may initially appear as a Slack member ID; it does not update automatically.</p></div></div>
    <div class="rule"><span class="num">02</span><div><h3>Count coffee shop purchases</h3><p class="small muted">Include what you spend at coffee shops, including your share of tax, tips and any delivery fees. Every entry goes into Coffee shop automatically. No category, receipt or purchase description is needed.</p></div></div>
    <div class="rule"><span class="num">03</span><div><h3>Log each amount once</h3><p class="small muted">Use Slack or the website for a purchase, not both. You can also log an unrecorded daily subtotal. Enter the new amount you spent, never your running monthly total.</p></div></div>
    <button class="button outline" data-tab="account">Set my leaderboard name</button>
  </section>
  <section class="card form-layout">
    <h2>Log spending in Slack</h2>
    <p class="small muted">Type a command in the group’s workspace. The confirmation is visible only to you; your recorded spending is shared with the challenge members.</p>
    <div class="command-row"><code>/spend 5.50</code><p class="small muted">Add $5.50 for today.</p></div>
    <div class="command-row"><code>/spend 5.50 2026-10-05</code><p class="small muted">Add a missed purchase on October 5. Replace the date with the actual purchase date, within October and no later than today.</p></div>
    <div class="command-row"><code>/spend total</code><p class="small muted">Check your recorded October total and review date.</p></div>
    <div class="command-row"><code>/spend help</code><p class="small muted">Show a reminder of the commands.</p></div>
    <p class="note">Purchases open October 1. Before then, you can join, set your name and check your total. If a command times out, check your total and Spending log before retrying so you don’t count the same purchase twice.</p>
    <button class="button outline" data-tab="add">Add spending on the website</button>
  </section>
  <section class="card form-layout">
    <h2>Fix a mistake or record a refund</h2>
    <div class="command-row"><code>/spend undo</code><p class="small muted">Remove your most recently added active entry. For a wrong amount or date, undo it and log the correct entry.</p></div>
    <p class="small muted">To remove a specific older entry, find it in Spending log and select its Undo button. You can only undo your own entries.</p>
    <div class="command-row"><code>/spend refund 5</code><p class="small muted">Subtract a $5 refund for a purchase that you counted in this challenge. Refunds can also include a date: <code>/spend refund 5 2026-10-05</code>.</p></div>
    <p class="small muted">On the website, use Add spending and check “This is a refund.” Undoing an entry or correcting spending in a period you already reviewed can clear your review confirmation; review again when everything is correct.</p>
    <button class="button outline" data-tab="entries">Open spending log</button>
  </section>
  <section class="card form-layout">
    <h2>Keep your review date current</h2>
    <p class="small muted">Check your receipts, bank app or notes, then confirm that every coffee shop purchase through a date has been logged. Do this regularly, including when you have spent nothing.</p>
    <div class="command-row"><code>/spend done</code><p class="small muted">Confirm you are fully caught up through today.</p></div>
    <div class="command-row"><code>/spend done 2026-10-14</code><p class="small muted">Confirm everything through October 14 is logged if you haven’t checked later dates yet.</p></div>
    <p class="note">There’s no need to add a $0 purchase. A review confirmation records that you checked. Members with no review confirmation are marked Unconfirmed and aren’t ranked.</p>
    <button class="button outline" data-tab="review">Review my entries</button>
  </section>
  <section class="card form-layout">
    <h2>Read the race and finish the month</h2>
    <p class="small muted">The chart shows each member’s cumulative dollars; lower is better. Use the date slider to compare totals on a particular day. The standings compare current totals, so check each person’s review date for missing entries. Equal totals tie; personal budgets don’t affect rankings.</p>
    <p class="small muted">The race refreshes about every 30 seconds while you’re viewing it. Use Refresh totals for an immediate update. The “Explore the preview” demo uses fictional data and never changes your real spending.</p>
    <p class="small muted">Only October purchases count. Make final corrections by the end of November 2, New York time. During November 1–2, commands without a date use October 31; include the actual October date when adding a missed purchase.</p>
    <div class="command-row"><code>/spend done 2026-10-31</code><p class="small muted">After checking the full month, confirm through October 31 to receive a final rank. This becomes available on October 31.</p></div>
    <p class="small muted">Members can see one another’s spending, but only change their own entries. You can download your own records from Account → Export my entries.</p>
    <button class="button outline" data-tab="race">Back to the race</button>
  </section>
  ${isOwner ? `<section class="card form-layout"><h2>For the organizer</h2><div class="command-row"><code>/spend invite @person</code><p class="small muted">Select a Slack member to allow them into the challenge. Then share the website link yourself; the command does not send an invitation message. Ask new members to set their leaderboard name in Account.</p></div></section>` : ''}`;
}
