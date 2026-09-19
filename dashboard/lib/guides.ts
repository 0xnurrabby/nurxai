export type GuideBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] };

export type Guide = {
  slug: string;
  title: string;
  h1: string;
  description: string;
  published: string;
  updated: string;
  readingMinutes: number;
  tags: string[];
  intro: string;
  blocks: GuideBlock[];
  faqs: Array<{ q: string; a: string }>;
  related: string[];
};

export const GUIDES: Guide[] = [
  {
    slug: "how-to-reply-on-x",
    title: "How to reply on X to grow your account: the 2026 playbook",
    h1: "How to reply on X to grow your account",
    description:
      "Replies are the highest-leverage growth action on X. Learn how to write replies people actually read, time them right, and turn conversations into followers.",
    published: "2026-09-17",
    updated: "2026-09-17",
    readingMinutes: 7,
    tags: ["X growth", "Replies", "Strategy"],
    intro:
      "If you are trying to grow on X, your replies matter more than your posts. A reply puts you inside a conversation that already has attention, which means the distribution problem is solved before you write a word. The catch is that most replies are invisible: generic praise, restated points, and filler comments get skimmed past by readers and quietly ignored by the ranking system.",
    blocks: [
      {
        type: "p",
        text: "This playbook covers what actually works in 2026: the weighting behind replies, the anatomy of a reply that earns a profile click, timing and targeting, and a daily routine that fits in 20 minutes."
      },
      { type: "h2", text: "Why replies outperform almost everything else" },
      {
        type: "p",
        text: "The public ranking signals behind X treat conversation as the strongest form of engagement. A reply is weighted many times higher than a like, and a reply that earns a reply back from the original author can be weighted dramatically higher again. A large share of the For You feed is also out-of-network, which means a strong reply can reach people who do not follow you yet. That combination is why small accounts can grow from the replies section while their own posts struggle for reach."
      },
      {
        type: "quote",
        text: "A like says someone noticed you. A good reply says your account is worth following. Only one of those compounds."
      },
      { type: "h2", text: "The anatomy of a reply that grows your account" },
      {
        type: "p",
        text: "Strong replies share five traits. Together they read as one sentence of value, not a mini essay:"
      },
      {
        type: "ul",
        items: [
          "Specific: it references a detail from the post, not a mood. A word they used, a number they dropped, a claim you want to extend or challenge.",
          "Additive: it gives the reader one new thing. A data point, a counterexample, a condition where their advice breaks, a small story.",
          "In your voice: vocabulary and examples that signal who you are. A founder, a designer, and a researcher should not sound interchangeable.",
          "Scannable: one idea, short sentences, no walls of text. Most replies should sit between 80 and 180 characters.",
          "Open: it leaves a thread others can join. A question, a playful challenge, or a claim that invites pushback."
        ]
      },
      {
        type: "p",
        text: "Before posting, run the profile test: if a stranger read only this reply, would they want to click your name? If the honest answer is no, rewrite it or skip the thread."
      },
      { type: "h2", text: "Timing and targeting: where visibility is decided" },
      {
        type: "p",
        text: "The reply window is short. Posts under 30 minutes old are still being distributed and sorted, and the first replies get the best placement. In practice:"
      },
      {
        type: "ul",
        items: [
          "Reply within the first 5 to 30 minutes of a post going live.",
          "Target accounts roughly 5 to 20 times your size. Big enough to bring an audience, small enough that your reply is not buried under hundreds of others.",
          "Prefer posts with under about 20 replies and an active discussion. A live thread with clear motion beats a giant thread you cannot stand out in.",
          "Turn on notifications for 10 to 15 accounts in your niche, then check them in short sprints instead of scrolling all day."
        ]
      },
      { type: "h2", text: "How long should a reply be?" },
      {
        type: "p",
        text: "Match the length to the goal. Short replies win fast threads. Medium replies win profile clicks. Long replies win memory and replies back."
      },
      {
        type: "table",
        headers: ["Tier", "Length", "Best for"],
        rows: [
          ["Lightning", "Under 60 characters", "Early positioning in fast-moving threads"],
          ["Anchor", "80 to 180 characters", "Profile clicks and follower conversion"],
          ["Mini-essay", "180 to 280 characters", "Filling an information gap or a strong contrarian take"]
        ]
      },
      {
        type: "p",
        text: "A simple daily mix is roughly 30 percent lightning, 60 percent anchor, and 10 percent mini-essay. If you are getting impressions but no follows, your replies are probably too short to show your thinking. If your replies feel ignored in busy threads, they are probably too long for the thread's speed."
      },
      { type: "h2", text: "Six reply styles that earn follows" },
      {
        type: "ol",
        items: [
          "Share a specific number: a result, a benchmark, or a date from your own experience.",
          "Tell a 30-second story that proves or disproves the point.",
          "Add a framework: a short list that organizes the messy part of the topic.",
          "Offer respectful contrast: agree with the direction, push back on one detail.",
          "Ask a question that extends the thread instead of a question that restarts it.",
          "Drop a one-line insight so sharp it works as a standalone post."
        ]
      },
      { type: "h2", text: "What to avoid" },
      {
        type: "ul",
        items: [
          "Generic praise like \"great point\" or \"so true\". It is invisible to readers and signals low quality to the ranking system.",
          "Links in replies. They reduce reach and they read as promotion. Keep links for your own posts and profile.",
          "Copy-pasting near-identical replies across posts. It is the fastest way to look automated.",
          "Replying to stale threads. If the traffic has moved on, your best reply is the next post, not the old one.",
          "Chasing volume over relevance. 15 excellent replies beat 50 generic ones in every measurable way."
        ]
      },
      { type: "h2", text: "A 20-minute daily routine" },
      {
        type: "ol",
        items: [
          "Minute 1 to 5: check notifications for your target accounts and pick 5 posts with motion.",
          "Minute 5 to 15: write 5 to 8 replies using the anatomy above. One idea each, your voice, no links.",
          "Minute 15 to 18: reply to anyone who responded to you. Follow-ups build more trust than first replies.",
          "Minute 18 to 20: note which replies earned profile visits so you can repeat the angles that work."
        ]
      },
      { type: "h2", text: "Where AI helps without taking over" },
      {
        type: "p",
        text: "AI is useful for the friction, not the judgment. Use it to read the context faster and to get several angles you would not have considered, then keep the edit: your detail, your opinion, your vocabulary. Tools that suggest drafts for you to review and post yourself stay inside X's rules, because the action reaching X is still a normal human reply from your browser. [NurAi](/) is built exactly this way: four context-aware drafts per post, no auto-posting, and you choose every word that goes out."
      }
    ],
    faqs: [
      {
        q: "How many replies per day should I post to grow on X?",
        a: "For steady growth, 15 to 20 thoughtful replies per day is the sweet spot. Stay under 50 to avoid spam signals, and if you are running a new account, ramp up gradually over the first few weeks."
      },
      {
        q: "What is the best time to reply on X?",
        a: "Reply within the first 5 to 30 minutes of a post going live. Early replies appear near the top of the thread and benefit from the post's peak distribution window. After about 30 minutes, most posts have peaked."
      },
      {
        q: "Do replies really grow followers on X?",
        a: "Yes, replies are one of the fastest levers for small accounts because they borrow the reach of conversations that already have attention. The growth comes from profile clicks, so make sure your bio and pinned post convert the attention you earn."
      }
    ],
    related: ["reply-guy-strategy", "x-reply-length", "best-ai-reply-tools-for-x"]
  },
  {
    slug: "reply-guy-strategy",
    title: "The reply guy strategy: how to grow on X without posting",
    h1: "The reply guy strategy: grow on X without posting",
    description:
      "The reply guy strategy works when it is deliberate. Learn the 70/30 rule, how to pick target accounts, and how to reply so you build a following instead of a reputation.",
    published: "2026-09-17",
    updated: "2026-09-17",
    readingMinutes: 6,
    tags: ["X growth", "Replies", "Playbook"],
    intro:
      "The reply guy has a bad reputation because most people do it lazily: vague agreement, instant self-promotion, and a hundred comments that all sound the same. Done deliberately, replying is the most reliable growth system on X for accounts that do not have distribution yet. You are not gambling on the algorithm noticing your posts. You are walking into conversations where the audience already exists.",
    blocks: [
      { type: "h2", text: "What the strategy actually is" },
      {
        type: "p",
        text: "Instead of expecting your own posts to carry your growth, you spend most of your active time joining other people's conversations with something worth reading. Every strong reply is a small audition in front of an audience that is already interested in your topic. Your profile does the closing."
      },
      {
        type: "p",
        text: "The practical version of this is the 70/30 rule: about 70 percent of your active time goes into replies and conversation, and 30 percent into original posts. Original posts build your own surface area. Replies build discovery. Early on, discovery is the bottleneck."
      },
      { type: "h2", text: "Step 1: build a target list of 10 to 15 accounts" },
      {
        type: "p",
        text: "Pick accounts 5 to 20 times your size whose audience matches yours. Accounts with a few thousand to a few tens of thousands of followers often have more active comment sections than mega accounts, and your reply can stay visible near the top. Turn on notifications for your list so you catch posts while they are still moving."
      },
      { type: "h2", text: "Step 2: reply early, but not blindly" },
      {
        type: "ul",
        items: [
          "Aim for the first 5 to 15 minutes after the post goes live.",
          "Skip posts that already have 50 or more replies unless your angle is genuinely strong.",
          "Prefer posts where the author is still replying. Active threads reward participation.",
          "Skip motivational one-liners and memes. There is nothing to add, so your reply cannot demonstrate anything."
        ]
      },
      { type: "h2", text: "Step 3: add one new piece of value" },
      {
        type: "p",
        text: "This is the whole game. Every good reply contains something the original post did not. Three moves cover most situations:"
      },
      {
        type: "ul",
        items: [
          "Add a missing condition: the advice is true for early-stage teams, less true once inbound volume hides weak positioning.",
          "Add a concrete example: a real workflow, a number, or a constraint from your own experience.",
          "Add useful tension: agree with the direction, then push back on one specific detail with a reason."
        ]
      },
      {
        type: "quote",
        text: "Generic agreement is invisible. Specific contribution is magnetic."
      },
      { type: "h2", text: "Step 4: follow up like a person" },
      {
        type: "p",
        text: "When someone answers your reply, answer back. Follow-up exchanges are where strangers become familiar names, and familiarity is what converts profile visits into follows. A thread where you replied three times with substance does more for your account than three separate one-off comments."
      },
      { type: "h2", text: "Step 5: make your profile close the deal" },
      {
        type: "ul",
        items: [
          "Bio: one clear line about what you do and who you help, plus a reason to follow.",
          "Pinned post: your best proof of thinking. A result, a framework, or a build log.",
          "Avatar and header: recognizable at a glance, because people scroll past quickly.",
          "Recent posts: three solid recent posts, so a visitor's first impression is not an empty profile."
        ]
      },
      { type: "h2", text: "Volume that is high enough to work and low enough to be safe" },
      {
        type: "p",
        text: "For most accounts, 15 to 20 relevant replies per day is the growth sweet spot. Established accounts can handle 30 to 50 if the replies stay genuinely unique. New accounts should start lower, around 10 to 15, and ramp over the first month. The line you should not cross is repetition: near-identical replies at scale read as automation and put your visibility at risk."
      },
      { type: "h2", text: "Common mistakes" },
      {
        type: "ul",
        items: [
          "Replying to the same account all day instead of spreading across your list.",
          "Writing replies that could sit under any post. If it fits everywhere, it matters nowhere.",
          "Turning every reply into a pitch. Promotion belongs in your own posts. Your replies sell you through quality alone.",
          "Ignoring follow-ups. The second exchange is often where the follow happens.",
          "Treating AI as the writer instead of the assistant. A draft you edited keeps your voice and stays safe. A batch of unedited AI replies gets skimmed and forgotten."
        ]
      },
      {
        type: "p",
        text: "If you want the drafting friction gone without giving up your judgment, [NurAi](/) reads the post you are replying to and offers four angles to react to, so you always have something specific to say. You edit, you post, you stay the author."
      }
    ],
    faqs: [
      {
        q: "Is the reply guy strategy spammy?",
        a: "It is spammy when replies are generic, repetitive, or promotional. It is effective when each reply adds a specific idea and fits the conversation you joined. The difference is whether you are contributing or just appearing."
      },
      {
        q: "Can I grow on X with replies only?",
        a: "Yes, especially early on, because replies borrow reach from conversations that already have attention. The most durable setup mixes replies with a small number of solid original posts so visitors find a reason to stay when they click your profile."
      },
      {
        q: "How many accounts should I target for replies?",
        a: "Start with 10 to 15 accounts roughly 5 to 20 times your size, whose audience matches yours. Turn on notifications and rotate across them instead of camping in one comment section."
      }
    ],
    related: ["how-to-reply-on-x", "is-ai-replying-safe-on-x", "x-reply-length"]
  },
  {
    slug: "is-ai-replying-safe-on-x",
    title: "Is using AI to reply on X safe? Rules, limits, and best practice",
    h1: "Is using AI to reply on X safe?",
    description:
      "AI-assisted replies are different from automated replies. Here is what X's rules actually restrict, which workflows are risky, and how to keep your account and reach safe.",
    published: "2026-09-17",
    updated: "2026-09-17",
    readingMinutes: 6,
    tags: ["Safety", "AI replies", "Compliance"],
    intro:
      "Short answer: writing with AI is safe. Posting with AI is where accounts get into trouble. X's rules target automation and platform manipulation, not the tools you use to draft text. The behavior that reaches X from your account is what gets judged, and a reply you reviewed and posted yourself is a normal human reply.",
    blocks: [
      { type: "h2", text: "What X's rules actually restrict" },
      {
        type: "p",
        text: "X's automation rules are about actions, not authorship. The restricted behaviors are things like posting automated, bulk, or duplicate content, aggressive following and unfollowing, and any attempt to manipulate engagement. Using an assistant to think and draft is not in that list. Auto-posting replies at scale is."
      },
      {
        type: "table",
        headers: ["Workflow", "Risk", "Why"],
        rows: [
          ["AI drafts, you review and post", "Low", "A human approves every reply and the action from your browser is a normal reply"],
          ["AI drafts, you edit slightly", "Low", "Same path, as long as replies are varied and relevant"],
          ["Auto-reply bot posting for you", "High", "Automated posting at scale violates platform rules and risks reach limits"],
          ["Bulk near-identical replies", "High", "Duplicate content and spam signals, even when a person clicks post"]
        ]
      },
      { type: "h2", text: "The real risk is not a ban, it is invisibility" },
      {
        type: "p",
        text: "In practice, most people do not get banned for AI replies. They get deboosted: replies stop appearing, engagement drops, and the account feels muted. This tends to happen when volume is high, wording repeats, or replies clearly do not match the conversation. If your replies suddenly stop getting any visibility, treat it as a signal, not a coincidence."
      },
      { type: "h2", text: "Volume limits worth respecting" },
      {
        type: "ul",
        items: [
          "Hard ceiling: around 500 replies per day for established accounts, less for new ones.",
          "Soft ceiling: stay under 50 replies per day, even when you are on a sprint.",
          "Healthy range for growth: 15 to 20 high-quality replies per day.",
          "New accounts: start at 10 to 15 per day and ramp up over 4 to 6 weeks."
        ]
      },
      { type: "h2", text: "How to keep your replies human" },
      {
        type: "ul",
        items: [
          "Edit every draft. Replace generic phrasing with your own detail, opinion, or example.",
          "Vary structure. If three replies in a row have the same shape, your account looks templated.",
          "Reply to what is actually in the post. AI drafts based on context are fine; AI drafts that ignore context are the problem.",
          "Match the language and tone of the conversation.",
          "Keep links out of replies. They reduce reach and they read as promotion."
        ]
      },
      { type: "h2", text: "What to do if your replies stop showing" },
      {
        type: "ol",
        items: [
          "Pause replies for 24 hours and let the account behave normally.",
          "Come back with 5 to 10 high-quality replies per day, spread across different accounts.",
          "Remove external links from replies until visibility recovers.",
          "Vary your wording so no two replies look related.",
          "Most accounts recover within 48 to 72 hours with this routine."
        ]
      },
      { type: "h2", text: "How NurAi is designed for the safe path" },
      {
        type: "p",
        text: "NurAi only ever suggests. It reads the post you are replying to and offers four drafts; you pick one, edit it, and post it yourself. There is no auto-posting mode, no bulk replying, and no automation touching your account. The tool exists to remove the blank-page friction, not the human judgment, which keeps your account on the right side of both the rules and your own audience."
      }
    ],
    faqs: [
      {
        q: "Will X ban me for using AI to write replies?",
        a: "Not for drafting. X's rules restrict automated posting, bulk behavior, and engagement manipulation. A reply you wrote with AI assistance, reviewed, and posted yourself is a normal reply. Auto-posting bots are the workflows that carry real enforcement risk."
      },
      {
        q: "Does X detect AI-written replies?",
        a: "X does not need to detect AI text to protect the platform. It looks at behavior: posting volume, duplication, relevance, and engagement patterns. Repetitive or bulk automated replies stand out on those signals regardless of who or what wrote them."
      },
      {
        q: "Is auto-reply on X safe if I set delays?",
        a: "Delays reduce obvious spam signals but do not change the nature of the activity. Automated posting at scale is against X's automation rules and can limit your reach. Suggestion-first tools that leave posting to you avoid this risk entirely."
      }
    ],
    related: ["how-to-reply-on-x", "best-ai-reply-tools-for-x", "reply-guy-strategy"]
  },
  {
    slug: "best-ai-reply-tools-for-x",
    title: "Best AI reply tools for X in 2026: an honest comparison",
    h1: "Best AI reply tools for X in 2026",
    description:
      "A practical comparison of AI reply tools for X and Twitter: what to look for, the workflows that carry risk, and how to pick a tool that keeps you in control.",
    published: "2026-09-17",
    updated: "2026-09-17",
    readingMinutes: 7,
    tags: ["Tools", "Comparison", "AI replies"],
    intro:
      "There are dozens of AI reply tools for X, and they are not interchangeable. Some suggest drafts and leave posting to you. Others automate replies at scale, which is the fastest way to lose visibility. Before you compare features, decide one thing: you want a writing assistant, not an automation bot.",
    blocks: [
      { type: "h2", text: "What actually matters when choosing a tool" },
      {
        type: "ul",
        items: [
          "No auto-posting: the tool should draft, not publish. You keep final control.",
          "Context awareness: it should read the post and thread, not generate from a template.",
          "Multiple angles: more than one draft per post, so you can pick the tone that fits.",
          "Voice: the output should be editable into your style, not locked to generic phrasing.",
          "Pricing model: subscriptions, token packs, bring-your-own-key, and pay-per-use all behave differently at different volumes.",
          "Privacy: know whether post content is processed in memory, stored, or sent to third parties.",
          "Platform support: Chrome, Edge, Brave, and other Chromium browsers cover most users."
        ]
      },
      { type: "h2", text: "The tools worth knowing" },
      {
        type: "p",
        text: "The market splits into three groups. Here is how the main options compare on the criteria above."
      },
      {
        type: "table",
        headers: ["Tool", "Approach", "Pricing model", "Notes"],
        rows: [
          ["NurAi", "Four context-aware drafts, human approval required", "3-day trial plus pay-per-use in USDC on Base", "No auto-post, no daily limit on pay-per-use"],
          ["ReplyGen", "One-click drafts with tones and styles", "One-time purchase with token packs", "Works without a social login"],
          ["Replix", "Three reply suggestions and quote-tweet drafts", "Free extension with paid tiers", "Explicitly never auto-posts"],
          ["ZuiTi", "Multi-provider drafts with style presets", "Bring your own API key", "Open source, local-first"],
          ["ReplyGuy", "In-browser draft generation with voice matching", "Subscription with a free tier", "Adds engagement and analytics features"]
        ]
      },
      {
        type: "p",
        text: "Tools in the auto-reply category also exist, and they are popular for a reason: they promise volume. The tradeoff is enforcement risk and deboosting, which is why the honest recommendation is to treat them as incompatible with a long-term account you care about. [The safety guide](/guides/is-ai-replying-safe-on-x) covers the details."
      },
      { type: "h2", text: "How pricing models actually compare" },
      {
        type: "ul",
        items: [
          "Subscriptions make sense if you reply every day and want a predictable bill.",
          "Token packs suit occasional users, but they expire in practice if the habit does not form.",
          "Bring-your-own-key is cheap for technical users and confusing for everyone else.",
          "Pay-per-use is the most honest model at low volume: you pay for the generations you actually use, with no monthly commitment. NurAi prices per generation in USDC on Base, which settles instantly without a card processor in the middle."
        ]
      },
      { type: "h2", text: "Why NurAi is built the way it is" },
      {
        type: "p",
        text: "NurAi makes one bet: the bottleneck in replying is not writing speed, it is having something specific to say. So instead of generating one generic reply, it reads the post you selected and offers four angles: an insight, a question, a respectful counterpoint, a concrete example. You pick, edit, and post. There is no auto-posting because the value is in your judgment, and your account's health depends on that judgment staying in the loop."
      },
      {
        type: "ul",
        items: [
          "Four drafts per post with different angles, not four paraphrases.",
          "Works inside X where you already are, in Chromium browsers.",
          "Trial first: three days to test the drafts against your real timeline.",
          "Pay only when you use it, or pick a fixed-duration plan if you prefer."
        ]
      },
      { type: "h2", text: "How to choose in five minutes" },
      {
        type: "ol",
        items: [
          "Decide your non-negotiable: human approval, no exceptions.",
          "Test one tool on real conversations for a week. Judge drafts by how often you post one with small edits.",
          "Check the pricing against your actual volume, not the volume you hope for.",
          "Read the privacy note. If post content storage is vague, that is an answer.",
          "Pick the tool that keeps your edits in the loop. The best AI reply tool is the one you outgrow least."
        ]
      },
      {
        type: "p",
        text: "You can try NurAi free for three days, then decide if the drafts earn a place in your routine. [Start the trial](/signup) or read [how it works](/#how) first."
      }
    ],
    faqs: [
      {
        q: "What is the best free AI reply tool for X?",
        a: "Most tools offer a free tier with daily limits, and several extensions are free with bring-your-own API keys. NurAi offers a free 3-day trial with a daily generation limit, then pay-per-use pricing if you continue."
      },
      {
        q: "Do AI reply tools get your X account shadowbanned?",
        a: "Tools that only suggest drafts do not change what X sees: you still post a normal human reply. Visibility problems come from automation, bulk posting, and repetitive replies, not from drafting assistance."
      },
      {
        q: "Which AI reply tool posts automatically?",
        a: "Auto-reply bots do, and they violate X's automation rules at scale. Suggestion-first tools like NurAi, Replix, ReplyGen, and ZuiTi deliberately leave the final post action to you."
      }
    ],
    related: ["is-ai-replying-safe-on-x", "how-to-reply-on-x", "reply-guy-strategy"]
  },
  {
    slug: "x-reply-length",
    title: "How long should an X reply be? A data-backed guide",
    h1: "How long should an X reply be?",
    description:
      "Most replies should land between 80 and 180 characters. Learn the three reply length tiers, when to use each, and the mistakes that quietly kill reach.",
    published: "2026-09-17",
    updated: "2026-09-17",
    readingMinutes: 5,
    tags: ["Replies", "Writing", "Data"],
    intro:
      "Reply length is one of the highest-leverage variables in X growth, and almost everyone gets it wrong in one of two directions: replies so short they say nothing, or mini essays that nobody finishes. The fix is matching length to the goal of that specific reply.",
    blocks: [
      { type: "h2", text: "The short answer" },
      {
        type: "p",
        text: "For most replies, aim for 80 to 180 characters. That range is long enough to add one specific thought and short enough to read in a scroll. Use shorter replies when speed is the value, and longer replies only when you are filling a genuine information gap."
      },
      { type: "h2", text: "The three tiers" },
      {
        type: "table",
        headers: ["Tier", "Length", "Best for", "Typical share"],
        rows: [
          ["Lightning", "Under 60 characters", "Getting into a fast-moving thread early", "About 30 percent"],
          ["Anchor", "80 to 180 characters", "Profile clicks and follower conversion", "About 60 percent"],
          ["Mini-essay", "180 to 280 characters", "Filling an information gap or adding depth", "About 10 percent"]
        ]
      },
      {
        type: "ul",
        items: [
          "Lightning replies position you inside a thread before it takes off. They work because of timing, not because of content. Avoid emoji-only fillers and empty agreement.",
          "Anchor replies are the workhorse. They carry one insight, one example, or one question, and they are the replies people click your profile from.",
          "Mini-essays earn bookmarks and replies back, but only when the original post left a real gap. Using 280 characters every time is a common mistake."
        ]
      },
      { type: "h2", text: "Match length to the goal" },
      {
        type: "ol",
        items: [
          "Want impressions? Go short and early, and join threads that are climbing.",
          "Want profile clicks? Go anchor length with a specific idea a stranger can evaluate in five seconds.",
          "Want to be remembered? Go mini-essay with proof: a number, a framework, or a story with a result."
        ]
      },
      { type: "h2", text: "The first ten words decide everything" },
      {
        type: "p",
        text: "Whatever the length, the opening fragment does the work. If your first ten words do not carry an idea, the rest will not be read. Read only the fragment out loud: if a stranger would not stop scrolling for it, rewrite it before anything else."
      },
      { type: "h2", text: "Formatting that helps" },
      {
        type: "ul",
        items: [
          "One idea per reply. Two ideas in one reply means neither lands.",
          "Short sentences. Line breaks are free readability.",
          "No walls of text. If it needs a paragraph, it might deserve a quote tweet or its own post instead.",
          "Standalone sense. Your reply should make sense to someone who scrolled past the original post quickly."
        ]
      },
      { type: "h2", text: "Common mistakes" },
      {
        type: "ul",
        items: [
          "Maxing out 280 characters every time, even when the thought is small.",
          "Replying with pure agreement, which has nothing to click, bookmark, or answer.",
          "Writing for the author only. The audience reading the thread is larger than the author.",
          "Cutting so short that the reply reads as noise."
        ]
      },
      {
        type: "p",
        text: "Drafting is where a tool helps most: if you have four angles to choose from, you can pick the one that fits the length and the thread. [NurAi](/) offers four context-aware drafts per post, and you decide what gets posted."
      }
    ],
    faqs: [
      {
        q: "What is the ideal reply length on X?",
        a: "For most replies, 80 to 180 characters. It is long enough to add one specific thought and short enough to be read at scroll speed. Use under 60 characters for early positioning and 180 to 280 only when you have genuine depth to add."
      },
      {
        q: "Do short or long replies get more engagement?",
        a: "Short replies get more likes because they are easy to react to, but likes are the cheapest signal. Profile clicks, the metric that drives follower growth, correlate with substance. Match the length to the goal instead of picking a universal rule."
      },
      {
        q: "How many characters should a reply be to get seen?",
        a: "Being seen is mostly about timing, not length: early replies in active threads get the best placement. After timing, 80 to 180 characters is the range where visibility converts into profile clicks."
      }
    ],
    related: ["how-to-reply-on-x", "reply-guy-strategy", "best-ai-reply-tools-for-x"]
  }
];

export function getGuide(slug: string) {
  return GUIDES.find((guide) => guide.slug === slug);
}
