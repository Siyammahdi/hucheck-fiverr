# Fiverr Risk Keyword Dictionary

> Single-word keywords for a Fiverr message risk checker.
>
> **Important:** Single-word matches should generally trigger contextual review rather than automatically classify a message as a violation. Many words can be legitimate depending on context.

## 1. Off-Platform Communication

```text
whatsapp
telegram
signal
skype
discord
wechat
messenger
viber
imo
line
kik
snapchat
instagram
facebook
linkedin
twitter
x.com
email
gmail
outlook
hotmail
yahoo
phone
telephone
mobile
number
call
text
sms
contact
website
url
link
domain
```

## 2. Payment / Money

```text
paypal
payoneer
wise
stripe
skrill
cashapp
venmo
zelle
westernunion
moneygram
bank
banking
transfer
wire
invoice
payment
pay
paid
cash
crypto
bitcoin
btc
ethereum
eth
usdt
usdc
wallet
coinbase
binance
revolut
```

## 3. Fiverr Bypass / Off-Platform Work

```text
offsite
offline
outside
direct
directly
private
privately
bypass
avoid
skip
external
independent
freelance
```

## 4. Personal Information

```text
password
passcode
otp
pin
username
login
credential
credentials
address
passport
ssn
socialsecurity
identity
id
license
dob
birthday
bankaccount
account
iban
swift
routing
```

## 5. Data Collection / Privacy

```text
scrape
scraping
crawler
crawl
harvest
harvesting
extract
extraction
collect
collection
database
leads
emails
contacts
profiles
personal
private
privacy
dox
doxxing
tracking
tracker
spy
spying
surveillance
```

## 6. Fraud / Deception

```text
fraud
fraudulent
scam
scammer
scamming
fake
faking
forged
forge
forgery
counterfeit
impersonate
impersonation
identity
deception
deceptive
cheat
cheating
manipulate
manipulation
refund
chargeback
overpayment
overpay
verification
verify
```

## 7. Reviews / Engagement Manipulation

```text
review
reviews
rating
ratings
feedback
followers
follower
likes
like
views
view
comments
comment
engagement
traffic
clicks
click
votes
voting
subscribers
subscriber
bot
bots
automated
automation
fake
organic
ranking
rankings
```

## 8. Hacking / Cybersecurity Risk

```text
hack
hacking
hacker
exploit
exploitation
vulnerability
vulnerable
payload
malware
virus
trojan
ransomware
spyware
keylogger
phishing
phish
credential
password
bruteforce
ddos
dos
botnet
backdoor
rootkit
shell
reverse
bypass
crack
cracker
breach
unauthorized
intrusion
penetration
steal
stealing
theft
access
```

## 9. Sexual / Adult Content

```text
porn
porno
pornography
nude
nudes
naked
sex
sexual
sexy
explicit
erotic
escort
prostitute
prostitution
fetish
sexting
intimate
nsfw
xxx
adult
onlyfans
camgirl
cam
```

## 10. Drugs

```text
cocaine
heroin
meth
methamphetamine
fentanyl
opioid
opium
marijuana
cannabis
weed
thc
mdma
ecstasy
lsd
mushrooms
psychedelic
drug
drugs
narcotic
narcotics
steroid
steroids
```

## 11. Weapons / Violence

```text
weapon
weapons
gun
guns
rifle
pistol
firearm
firearms
ammo
ammunition
bullet
bullets
bomb
bombs
explosive
explosives
grenade
grenades
missile
knife
knives
sword
attack
attacking
kill
killing
murder
murdering
assault
violence
violent
terror
terrorist
terrorism
```

## 12. Hate / Harassment

```text
hate
hateful
harass
harassment
bully
bullying
threat
threaten
threatening
slur
racist
racism
sexist
sexism
homophobic
transphobic
discrimination
discriminate
inferior
supremacy
extremist
extremism
```

## 13. Academic / Employment Cheating

```text
exam
exams
test
tests
assignment
assignments
homework
coursework
thesis
dissertation
essay
essaywriting
cheat
cheating
impersonate
impersonation
interview
assessment
certification
certificate
credential
```

## 14. Financial Guarantees

```text
guaranteed
guarantee
profit
profits
income
returns
investment
investments
trading
forex
forextrading
crypto
financial
money
wealth
rich
double
triple
riskfree
```

## 15. Potentially Suspicious Marketplace Terms

```text
account
accounts
buy
sell
selling
purchase
resell
reselling
transfer
ownership
owner
stolen
leaked
leak
leaks
underground
darkweb
darknet
illegal
illicit
unauthorized
```

# High False-Positive Words

These words can appear in legitimate Fiverr conversations, so they should **not automatically be treated as violations**:

```text
email
phone
number
contact
website
link
url
whatsapp
instagram
facebook
paypal
payment
bank
account
password
login
security
hack
exploit
review
rating
followers
traffic
exam
test
assignment
crypto
adult
camera
gun
```

# Useful Multi-Word Combinations

Single-word detection is weaker than detecting combinations and intent. These combinations are useful signals:

```text
whatsapp + number
whatsapp + contact
email + directly
paypal + payment
pay + outside
fiverr + bypass
continue + telegram
contact + privately
hire + directly
pay + directly
website + order
```

# Recommended Detection Logic

Use the keywords in three levels:

### Level 1 — High-Risk Single Words

Words that can justify an immediate warning depending on your policy.

Examples:

```text
ransomware
phishing
terrorism
cocaine
heroin
pornography
doxxing
keylogger
malware
```

### Level 2 — Context-Sensitive Words

Words that should be passed to a context/intent classifier.

Examples:

```text
email
phone
whatsapp
website
payment
paypal
account
password
review
traffic
hack
exploit
exam
crypto
```

### Level 3 — Combination / Intent Detection

Give more weight when multiple related terms appear together.

Examples:

```text
"whatsapp" + "number"
"pay" + "outside"
"paypal" + "directly"
"email" + "continue"
"hire" + "privately"
"website" + "order"
"fiverr" + "bypass"
```

A production checker should combine keyword matching, phrase matching, entity detection, and intent/context classification rather than relying only on this dictionary.
