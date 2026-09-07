# Stellaris Intel

Build and fully integrate a production-grade DEX Market Intelligence Terminal into my existing Lovable project.

I have already provided the DEX Screener API reference/materials in this conversation. Treat that material as the source specification for the DEX Screener integration. Interrogate the supplied API documentation carefully, understand the available endpoints and response structures, and integrate the appropriate endpoints into the application rather than mocking them.

I have also already provided the project infrastructure/context. If Supabase and Vercel are already connected, KEEP AND USE THEM. Do not create a separate unrelated project, do not replace working infrastructure, and do not ask me to manually recreate functionality that already exists.

The final product should feel like a living AI-powered market intelligence command center.

==================================================

1. PRODUCT CONCEPT

==================================================

The application is a sophisticated market-data research terminal powered by:

DEX Screener data
+
historical observations
+
market-structure analysis
+
risk analysis
+
anomaly detection
+
multiple specialized analysis agents
+
confidence scoring
+
advanced filters
+
real-time visual activity
+
alerts
+
watchlists
+
explainable intelligence.

This is NOT a basic DEX Screener clone.

It should feel like an advanced system continuously observing a huge decentralized market and processing enormous amounts of information.

The visual metaphor is:

A futuristic AI observatory watching the decentralized markets in real time.

==================================================

2. CRITICAL — DO NOT MAKE THIS A STATIC MOCKUP

==================================================

Everything possible must be functional.

Do not populate the interface with fake numbers simply to make it look alive.

If live API data is unavailable, explicitly display:

DATA UNAVAILABLE
WAITING FOR DATA
INSUFFICIENT DATA
STALE DATA

Never fabricate market information.

The animations may be simulated visual system activity, but actual market metrics must come from real data.

Clearly distinguish:

LIVE DATA
CALCULATED DATA
AI/AGENT ANALYSIS
VISUAL SYSTEM ACTIVITY

==================================================

3. VISUAL IDENTITY — SPACE / AI COMMAND CENTER

==================================================

The visual design is extremely important.

Create a deep-space futuristic environment.

The background should feel like:

deep space

enormous star field

subtle nebula/cloud structures

faint galaxies

distant particles

subtle cosmic depth

extremely dark background

layered atmospheric depth

BUT:

Do not make it look like a cartoon space game.

It should feel like a sophisticated technology / financial intelligence system.

Think:

NASA mission control
+
advanced AI research laboratory
+
quantitative trading terminal
+
deep-space computer
+
futuristic intelligence command center.

Use a very dark base.

Use restrained luminous accents.

Avoid excessive rainbow colors.

Use a sophisticated palette based primarily around:

dark black
deep navy
deep violet
cool cyan
white
subtle electric blue

Use accent colors only where they communicate information.

==================================================

4. LIVING BACKGROUND

==================================================

The background should feel ALIVE.

Create several subtle animated layers.

Layer 1:
Slow-moving stars.

Layer 2:
Tiny particles moving through space.

Layer 3:
Very subtle nebula movement.

Layer 4:
Faint grid structures.

Layer 5:
Data particles moving along paths.

Layer 6:
Extremely subtle numerical/data overlays.

Layer 7:
Occasional connection lines between data nodes.

Do NOT let the background interfere with readability.

The movement should be sophisticated and subtle.

It should create the feeling that the entire system is constantly processing information.

==================================================

5. LIVE DATA STREAM VISUALIZATION

==================================================

Add a futuristic data-stream layer behind the main interface.

Show small streams of:

numbers
percentages
timestamps
token symbols
chain identifiers
liquidity values
volume values
transaction counts
system messages

moving slowly through the environment.

Examples of visual elements:

+12.42%
$182,421
VOL 482K
TX 8,421
LIQ 192K
CHAIN
DEX
PAIR
ANALYZING
SCANNING
DATA RECEIVED
ANOMALY
RISK UPDATE

These are UI visualizations.

Do NOT fabricate values and present them as real market data.

Where a displayed value represents actual data, connect it to the live data layer.

==================================================

6. CENTRAL AI CORE

==================================================

The main dashboard should have a visual representation of the analysis engine.

Create a central animated "AI CORE" visualization.

It could resemble:

a glowing orbital sphere

interconnected nodes

neural network

rotating data rings

orbiting particles

scanning lines

flowing information

The AI Core should continuously animate.

Around it, show live system states:

SCANNING
NORMALIZING
ANALYZING
COMPARING
DETECTING
ASSESSING
UPDATING

These states must correspond to actual backend processes whenever possible.

Do not pretend the AI is doing something it is not actually doing.

If no agent is running, show:

SYSTEM READY

rather than fake activity.

==================================================

7. MAIN DASHBOARD LAYOUT

==================================================

Create a premium command-center dashboard.

Top bar:

SYSTEM STATUS
LIVE DATA
LAST UPDATE
ACTIVE CHAINS
ACTIVE DEXs
ALERT COUNT
USER PROFILE

Main area:

LEFT:
Navigation / filters

CENTER:
Market intelligence visualization

RIGHT:
Live analysis feed

BOTTOM:
Data tables and charts

The interface should be information-dense but organized.

==================================================

8. TOP NAVIGATION

==================================================

Create:

COMMAND CENTER
DISCOVER
MARKETS
WATCHLIST
RISK
ANOMALIES
AGENTS
ALERTS
TRENDS
SYSTEM

Use icons and clean labels.

==================================================

9. COMMAND CENTER

==================================================

The primary screen should answer:

"What is happening right now?"

Display:

LIVE MARKET ACTIVITY
NEWLY OBSERVED PAIRS
UNUSUAL ACTIVITY
LIQUIDITY CHANGES
VOLUME CHANGES
RISK CHANGES
DATA QUALITY
AGENT STATUS

Create live updating cards.

==================================================

10. MARKET ACTIVITY FEED

==================================================

Create a continuously updating event stream.

Examples:

NEW PAIR OBSERVED
LIQUIDITY CHANGE DETECTED
VOLUME ANOMALY
PROFILE UPDATED
COMMUNITY TAKEOVER OBSERVED
BOOST DETECTED
RISK CLASSIFICATION CHANGED
DATA SOURCE UPDATED
ANALYSIS COMPLETE

Each event should contain:

timestamp
token
chain
DEX
event
severity
confidence

Clicking an event opens the relevant analysis.

==================================================

11. DEX SCREENER INTEGRATION

==================================================

Use the supplied DEX Screener API specification.

Integrate appropriate endpoints including:

/latest/dex/search

/latest/dex/pairs/{chainId}/{pairId}

/token-pairs/v1/{chainId}/{tokenAddress}

/tokens/v1/{chainId}/{tokenAddresses}

/token-profiles/latest/v1

/token-profiles/recent-updates/v1

/community-takeovers/latest/v1

/ads/latest/v1

/token-boosts/latest/v1

/token-boosts/top/v1

/orders/v1/{chainId}/{tokenAddress}

/metas/trending/v1

/metas/meta/v1/{slug}

Respect the documented rate limits.

Do not repeatedly poll unnecessarily.

Use caching, batching, deduplication, retries, and backoff.

==================================================

12. BACKEND DATA PIPELINE

==================================================

Create:

DEX API
↓
INGESTION
↓
VALIDATION
↓
NORMALIZATION
↓
DATABASE
↓
HISTORICAL ENGINE
↓
ANALYSIS AGENTS
↓
RISK ENGINE
↓
ANOMALY ENGINE
↓
ALERT ENGINE
↓
FRONTEND

Every stage should be independently understandable.

==================================================

13. RAW DATA VS CALCULATED DATA

==================================================

Clearly distinguish:

RAW OBSERVATION

CALCULATED METRIC

AGENT OBSERVATION

RISK ASSESSMENT

ANOMALY

Do not mix these together.

For example:

RAW:
Liquidity = $182,000

CALCULATED:
Volume / Liquidity = 4.7x

AGENT:
Liquidity Analyst detected elevated turnover relative to current liquidity.

RISK:
Liquidity risk elevated.

CONFIDENCE:
78%

==================================================

14. HISTORICAL ENGINE

==================================================

Store historical observations.

Track:

price
liquidity
volume
buys
sells
transactions
FDV
market cap when available
pair age
boost status
profile status
risk score
risk dimensions
confidence
anomalies

Allow charts across:

5m
1h
6h
24h
7d
30d

Only show timeframes supported by available historical data.

Never fabricate historical data.

==================================================

15. BASELINE ENGINE

==================================================

Do not use simplistic universal thresholds.

Build peer-aware baselines.

Compare tokens/pairs against similar:

chains
DEXs
liquidity ranges
pair ages
volume ranges
market-cap ranges

Calculate percentile-style contextual metrics where sufficient data exists.

Example:

"Current volume is unusually high relative to comparable monitored pairs."

This is much more useful than a simple arbitrary threshold.

==================================================

16. ANOMALY DETECTION

==================================================

Create a dedicated anomaly engine.

Detect unusual changes in:

price
volume
liquidity
transactions
buy/sell distribution
activity acceleration
liquidity acceleration
volume/liquidity ratio
volatility

Create anomaly levels:

NORMAL
NOTABLE
UNUSUAL
SEVERE

Every anomaly must show:

WHAT CHANGED
WHEN IT CHANGED
HOW MUCH IT CHANGED
BASELINE
WHY IT IS UNUSUAL
CONFIDENCE

==================================================

17. RISK ENGINE

==================================================

Create a transparent Market Risk Assessment.

Risk categories:

LOWER OBSERVED RISK
MODERATE OBSERVED RISK
HIGH OBSERVED RISK
EXTREME OBSERVED RISK
INSUFFICIENT DATA

Analyze separate dimensions:

Liquidity Risk
Volatility Risk
Market Structure Risk
Activity Risk
Pair Age Risk
Data Quality Risk
Promotional Activity Risk
Anomaly Risk

Never present the risk score as expected return.

==================================================

18. CONFIDENCE ENGINE

==================================================

Create a completely separate confidence system.

Confidence should depend on:

data completeness
data freshness
number of observations
historical depth
API consistency
availability of required metrics

Example:

RISK:
HIGH

CONFIDENCE:
LOW

REASON:
Insufficient historical observations.

This is essential.

==================================================

19. MULTI-AGENT SYSTEM

==================================================

Create independent backend analysis agents.

AGENT 01
MARKET STRUCTURE

AGENT 02
LIQUIDITY

AGENT 03
ACTIVITY

AGENT 04
VOLATILITY

AGENT 05
DATA QUALITY

AGENT 06
PROMOTIONAL ACTIVITY

AGENT 07
ANOMALY DETECTION

AGENT 08
RISK SYNTHESIS

Each agent should produce structured output.

Each agent must identify:

observations
warnings
confidence
supporting data
timestamp

==================================================

20. AGENT VISUALIZATION

==================================================

Create an AGENTS page showing all agents as a living network.

Example:

          MARKET STRUCTURE
                ↓


LIQUIDITY → AI CORE ← ACTIVITY
↓
VOLATILITY → SYNTHESIS ← ANOMALY
↓
RISK ENGINE

Each node should show:

ONLINE
PROCESSING
WAITING
ERROR

When an actual analysis runs, animate the information flow.

When no process is occurring, do not fake processing.

==================================================

21. AGENT DISAGREEMENT

==================================================

Never hide disagreements.

Show:

CONSENSUS
5 / 8 AGENTS

DISAGREEMENT
2 AGENTS

UNRESOLVED
1 AGENT

Allow users to inspect each agent's reasoning inputs and observations.

==================================================

22. RISK SCORE

==================================================

Create a 0–100 Market Risk Score.

Break it down visibly.

Example:

OVERALL:
78

Liquidity:
21
Volatility:
18
Market Structure:
14
Activity:
11
Data Quality:
9
Promotional:
5

Make the weighting configurable in backend configuration.

Store the risk-engine version with every assessment.

==================================================

23. ADVANCED FILTER BUILDER

==================================================

Build a powerful visual query builder.

Filters:

Chain
DEX
Liquidity
Volume
FDV
Market Cap
Transactions
Buys
Sells
Pair Age
Price Change
Volatility
Liquidity Change
Volume Change
Risk
Confidence
Anomaly
Data Freshness
Boosts
Profile
Community Takeover

Support:

AND
OR
NOT
nested groups

Show the number of matching observations.

Example:

MATCHING CONDITIONS
147

Do NOT call them:

BEST TOKENS
TOP INVESTMENTS
BUY OPPORTUNITIES

==================================================

24. DISCOVERY PAGE

==================================================

Create a powerful discovery interface.

Search:

name
symbol
contract
pair
chain
DEX

Results should be sortable.

Columns:

Token
Chain
DEX
Price
5m
1h
6h
24h
Liquidity
Volume
Transactions
Pair Age
Risk
Confidence
Anomalies

==================================================

25. TOKEN INTELLIGENCE PAGE

==================================================

Create a detailed research terminal for every token/pair.

Header:

TOKEN
SYMBOL
CHAIN
DEX
PAIR
ADDRESS
DATA STATUS

Then:

PRICE

LIQUIDITY

VOLUME

TRANSACTIONS

MARKET STRUCTURE

HISTORICAL CHART

RISK

CONFIDENCE

ANOMALIES

AGENT ANALYSIS

TIMELINE

PROFILE

PROMOTIONAL ACTIVITY

WATCHLIST

==================================================

26. VISUAL TOKEN GRAPH

==================================================

Create an interactive market visualization.

Show nodes for:

Token
Pair
DEX
Chain

Connections represent relationships.

Click a node to investigate it.

Make this visually beautiful and animated.

==================================================

27. MARKET MAP

==================================================

Create a cosmic market map.

Chains appear as major regions.

DEXs appear as nodes.

Pairs/tokens appear as smaller points.

Use particle movement to communicate relationships.

Users can zoom:

MARKET
→ CHAIN
→ DEX
→ PAIR
→ TOKEN

==================================================

28. WATCHLIST

==================================================

Allow users to save tokens/pairs.

Display:

price
liquidity
volume
risk
confidence
anomalies
last update

Allow folders/custom groups.

==================================================

29. ALERT ENGINE

==================================================

Create alerts for:

liquidity changes
volume anomalies
transaction anomalies
risk changes
confidence changes
data becoming stale
pair disappearance
profile changes
boost detection
community takeover detection

Use deduplication and cooldown periods.

==================================================

30. ALERT VISUALS

==================================================

Alerts should travel through the interface as subtle visual signals.

Example:

A new anomaly creates a small particle stream toward the Alerts panel.

Do not make the entire screen flash.

Avoid casino-style notifications.

==================================================

31. TRENDING / META ANALYSIS

==================================================

Use the documented meta endpoints where appropriate.

Display:

meta name
market cap
liquidity
volume
token count
market-cap changes

Allow users to investigate a meta and its associated pairs.

Do not interpret trending status as a recommendation.

==================================================

32. PROFILE / COMMUNITY / BOOST DATA

==================================================

Integrate available:

token profiles
recent profile updates
community takeovers
boosts
ads

Clearly label these as promotional/community metadata.

Never treat them as proof of quality or safety.

==================================================

33. DATA PROVENANCE

==================================================

Every important metric should expose:

SOURCE
OBSERVED AT
CALCULATED AT
ENGINE VERSION

Example:

Source:
DEX Screener

Observed:
21:24:31

Calculated:
21:24:34

Risk Engine:
v1.0

==================================================

34. SYSTEM HEALTH PAGE

==================================================

Create a SYSTEM page.

Display:

DEX API
DATABASE
CACHE
INGESTION
ANALYSIS AGENTS
RISK ENGINE
ANOMALY ENGINE
ALERT ENGINE

Each shows:

HEALTHY
DEGRADED
ERROR
OFFLINE

Also show:

API request count
cache hit rate
API errors
stale records
agent failures
last successful ingestion
database status

==================================================

35. API RATE MANAGEMENT

==================================================

Create centralized request management.

Features:

rate-limit tracking
request queue
cache
deduplication
batching
retry
backoff
timeouts

The application must remain stable when the API is unavailable.

==================================================

36. DATABASE

==================================================

Use Supabase.

Create appropriate tables for:

tokens
pairs
token_profiles
pair_observations
token_observations
risk_assessments
risk_factors
agent_observations
agent_runs
anomalies
alerts
alert_events
watchlists
watchlist_items
user_filter_presets
market_snapshots
api_cache
system_health
user_settings

Use proper indexes.

Use Row Level Security.

==================================================

37. PERFORMANCE

==================================================

The application must remain fast with thousands or millions of historical observations.

Use:

pagination
virtualized tables
server-side filtering
indexed queries
lazy loading
caching
incremental updates
debounced search

Do not dump massive datasets into the browser.

==================================================

38. MOBILE

==================================================

Create a real mobile layout.

Do not simply shrink desktop.

Prioritize:

Risk
Confidence
Liquidity
Volume
Activity
Anomalies
Alerts

==================================================

39. DESKTOP

==================================================

Desktop should feel like a professional command terminal.

Use:

dense tables
large charts
multiple information panels
persistent filters
keyboard shortcuts
expandable analysis panels

==================================================

40. KEYBOARD SHORTCUTS

==================================================

Add useful shortcuts.

Examples:

/
Search

G D
Dashboard

G W
Watchlist

G A
Alerts

G R
Risk

G M
Markets

ESC
Close panel

Make shortcuts discoverable through a help overlay.

==================================================

41. RESEARCH NOTES

==================================================

Allow private user notes.

Notes must NOT influence automated analysis.

==================================================

42. TIMELINE

==================================================

Every token should have a chronological timeline.

Events include:

pair creation
profile update
boost
advertisement
community takeover
liquidity change
volume anomaly
activity anomaly
risk change
confidence change

==================================================

43. MODEL VERSIONING

==================================================

Store:

agent version
risk engine version
analysis timestamp

Never silently overwrite historical analysis.

==================================================

44. ANALYTICS QUALITY

==================================================

Build a backend analytics-quality system.

Measure:

false positives
false negatives
anomaly precision
data completeness
data freshness
agent reliability
API reliability

Do not evaluate the system based on trading returns.

Evaluate whether the intelligence system correctly describes observable market conditions.

==================================================

45. NO FAKE AI

==================================================

This is critical.

Do not create fake AI animations that claim:

"Analyzing blockchain..."

when no backend process is occurring.

The visual system can remain alive through environmental animation, but status labels must correspond to actual system state.

If agents are processing:

PROCESSING

If waiting:

WAITING

If complete:

COMPLETE

If failed:

ERROR

==================================================

46. NO FAKE MARKET DATA

==================================================

Never invent:

prices
volume
liquidity
transactions
market cap
FDV
risk scores
historical observations

Use actual API observations or clearly label calculated/demo/system data.

==================================================

47. RESPONSIBLE LANGUAGE

==================================================

Do not use:

BUY
SELL
BUY NOW
MOON
100X
GUARANTEED
SAFE
EASY MONEY
BEST INVESTMENT

Instead use:

OBSERVED
ELEVATED
UNUSUAL
HIGH RISK
LOW CONFIDENCE
INVESTIGATE
INSUFFICIENT DATA
MARKET ACTIVITY
RESEARCH SIGNAL

==================================================

48. IMPORTANT: "BEST RESULTS" WITHOUT AUTOMATED TRADING

==================================================

The system should optimize the user's research workflow.

It should surface:

unusual conditions
significant changes
high-quality data
important anomalies
large liquidity changes
unusual activity
changing risk conditions
new observations
data-quality problems

But the user makes the final decision.

==================================================

49. VISUAL ANIMATION SYSTEM

==================================================

Create a centralized animation manager.

Do not put hundreds of independent heavy animations on the page.

Use efficient CSS/canvas/WebGL techniques where appropriate.

Animations should include:

star movement
particle movement
data streams
network connections
AI-core rotation
orbital rings
subtle scan lines
chart transitions
event particles
node pulses

Respect:

prefers-reduced-motion

Provide reduced-motion behavior.

==================================================

50. VISUAL HIERARCHY

==================================================

The space background must NEVER overpower the data.

Foreground:

DATA

Second:

ANALYSIS

Third:

SYSTEM VISUALIZATION

Background:

COSMIC ENVIRONMENT

The interface must remain readable.

==================================================

51. LANDING / LOGIN

==================================================

Before login, show a cinematic but lightweight preview.

Background:

deep space

Foreground:

large title:

DEX MARKET
INTELLIGENCE

Subtitle:

"Real-time decentralized market intelligence, risk analysis, and anomaly detection."

Show subtle animated data flowing behind it.

Do not display fake market statistics.

==================================================

52. COMMAND CENTER EXPERIENCE

==================================================

When the user logs in, the system should feel like it has entered an active monitoring state.

Sequence:

INITIALIZING
↓
CONNECTING DATA SOURCES
↓
VALIDATING DATA
↓
LOADING MARKET STATE
↓
ANALYSIS READY

Only show these states when corresponding application initialization steps actually occur.

Then:

SYSTEM ONLINE

==================================================

53. EMPTY STATES

==================================================

Make empty states useful.

Example:

NO WATCHLIST ITEMS

"Add a token or pair to begin monitoring."

NOT:

"Nothing here."

==================================================

54. ERROR STATES

==================================================

Never display raw technical errors to users.

Show:

DATA SOURCE UNAVAILABLE

Then:

"The DEX data source could not be reached. Existing cached observations may still be available."

==================================================

55. SECURITY

==================================================

Use secure environment variables.

Never expose secrets.

Never store:

private keys
seed phrases
wallet passwords

No trading functionality.

==================================================

56. EXISTING PROJECT

==================================================

Before implementing anything:

Inspect the existing application.

Identify current routing.

Identify existing Supabase configuration.

Identify existing authentication.

Identify existing components.

Identify existing database schema.

Identify existing environment variables.

Identify existing Vercel configuration.

Reuse existing infrastructure.

Add functionality without destroying existing working features.

Do not rebuild working systems unnecessarily.

Do not create an unrelated second application.

==================================================

57. IMPLEMENTATION ORDER

==================================================

Build in this order:

PHASE 1
Existing-project inspection

PHASE 2
Database schema

PHASE 3
DEX Screener API service

PHASE 4
Caching/rate management

PHASE 5
Data normalization

PHASE 6
Historical observation engine

PHASE 7
Risk engine

PHASE 8
Confidence engine

PHASE 9
Anomaly engine

PHASE 10
Backend agents

PHASE 11
Alerts

PHASE 12
Dashboard

PHASE 13
Discovery

PHASE 14
Token intelligence

PHASE 15
Agent visualization

PHASE 16
Market map

PHASE 17
Cosmic visual system

PHASE 18
Performance optimization

PHASE 19
Testing

PHASE 20
Final integration

==================================================

58. ACCEPTANCE TEST

==================================================

Before considering the project complete, verify:

DEX Screener requests work.

Rate limits are respected.

API failures are handled.

Cache works.

Data is normalized.

Historical observations are stored.

Risk calculations are reproducible.

Confidence is separate from risk.

Anomalies require sufficient data.

Filters work.

Watchlists work.

Alerts work.

Agents have real backend execution states.

Agent disagreements are visible.

Historical charts work.

System health works.

Mobile works.

Desktop works.

Reduced-motion mode works.

No fake market data exists.

No fake historical data exists.

No trading functionality exists.

Existing project functionality remains intact.

==================================================

59. FINAL DESIGN STANDARD

==================================================

The finished application should feel like:

A futuristic AI command center floating in deep space, continuously observing a massive decentralized financial ecosystem.

There should be a sense of:

DEPTH
INTELLIGENCE
MOTION
SCALE
PRECISION
ACTIVITY
DISCOVERY

The user should feel like they are looking into a massive machine processing thousands of market observations.

But underneath the visual spectacle, the software must be:

FAST
ACCURATE
TRANSPARENT
EXPLAINABLE
DATA-DRIVEN
RELIABLE
SECURE
MAINTAINABLE

Do not sacrifice functionality for visual effects.

Do not sacrifice readability for visual effects.

Do not sacrifice data integrity for visual effects.

The visual experience should make the real intelligence underneath the application feel powerful.

==================================================

60. FINAL INSTRUCTION TO LOVABLE

==================================================

Take everything supplied in this conversation as the project specification.

Use the supplied DEX Screener documentation as the API reference.

Inspect the existing project before modifying it.

Tie the frontend, backend, Supabase database, API layer, analysis agents, risk engine, historical engine, anomaly detection, filtering, alerts, and visual system together into ONE coherent application.

Do not build disconnected demos.

Do not leave placeholder buttons.

Do not create fake functionality.

Do not create a second unrelated project.

Do not remove existing working functionality.

Build the complete integrated system.

The final experience should be a living, futuristic DEX Market Intelligence Terminal with a deep-space environment, continuously moving data visualizations, an animated AI-core visualization, real backend processing states, real DEX Screener data, historical intelligence, transparent risk analysis, anomaly detection, advanced filtering, and explainable multi-agent analysis.

Make it feel alive.

Make it feel intelligent.

Make it feel massive.

But make the underlying data and analysis completely honest about what the system actually knows.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/94daf48b-7ea3-4c4f-b2c0-ab7d59178e5d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
