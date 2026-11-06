# Reach

## Who it's for
- **Mumbai suburban commuters** (millions of daily trips; our pitch figure is about 9.5 million daily commuters). They
  get a pass that can't be traced from scan to scan and works in tunnels and packed coaches.
- **Ticket checkers (TCs).** They get a check that takes about 50 ms, needs no signal, and shows one plain verdict:
  Green, Amber or Red.
- **Rail operators and auditors.** They get a pass system where anyone can verify which issuer is valid and which pass
  list is current, without trusting one company's database.

## Would they use it?
- **Commuters change nothing about how they travel.** There's no wallet, no sign-up and no crypto words: buy once, then
  show the code from the lock screen or the notification.
- **The checker's workflow is the one they already have:** point the phone and read the colour.
- **Operators already sell digital passes.** BombayLocal removes the server-side tracking those systems add and the
  connectivity they need.

## Can they try it today?
Yes, with no install:

| Way | Link | What you do |
|---|---|---|
| Browser demo | https://harshittgupta.github.io/BombayLocal/ | Buy a pass (simulated payment), wait about a minute for the issuer's root on Ethereum, then drag the checker's phone onto the code: Green → Amber → Red, checked with 0 network requests |
| Android apps | [latest release](https://github.com/Harshittgupta/BombayLocal/releases/latest) | Install BombayLocal Pass and BombayLocal Scan on two phones; buy, go offline, scan |
| Live audit | https://harshittgupta.github.io/BombayLocal/audit/ | Watch every public claim checked against Ethereum and Arkiv |

Test activity so far (mostly our own purchases while building and demoing), read live from Arkiv on 2026-11-07:
- 25 passes issued;
- signed roots #3–#20 still live;
- 46 issuer writes to Arkiv;
- 20 `postRoot` transactions on Sepolia.

Roots #13 onward came from purchases on the hosted issuer, including the web demo.

## Will we keep building?
Yes. The next steps, in order:
1. A fixed publish cadence and an Arkiv access key for the hosted issuer.
2. Delta sync, so phones download only new passes.
3. A multisig authority and a multi-party trusted-setup ceremony.
4. A pilot with one operator on one line, with real payments.

Production notes are in the [README](../README.md#path-to-production) and the threat model in [SPEC.md §8](../SPEC.md).
