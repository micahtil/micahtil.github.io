---
layout: page
title: The Rise of Elmo
permalink: /sesame-street/
---

I've started  watching Sesame Street with my son from time to time. I was stunned at how omnipresent Elmo has become. Elmo was already popular when I was a child (I was 6 when the Tickle Me Elmo dolls were released) but it seems to have reached a new level - it really feels like it has become the Elmo show, and every other character is secondary.

I wanted to see when this change happened, and exactly how large of a change it was. Unfortunately, episode scripts aren't available online to analyze. But the [Muppet Wiki](https://muppet.fandom.com/wiki/Sesame_Street) is very comprehensive and includes a detailed summary of every episode, segment by segment.

|![bert and ernie](/assets/bert-and-ernie.png)|
|---|
|A scene summary from the very first episode of Sesame Street|

I scraped the wiki for every segment summary across the show's run and checked for the presence of characters' names.

The chart below conveys season averages -- for each season, on average, what percent of episode segments did that muppet appear in.
![segments per episode](/assets/sesame_Figure_1.png)

Although first introduced as a named character in 1980, Elmo really starts to pick up steam in the mid-80s, and by 1990 is clearly a popular character. By 1996, the year of the Tickle Me Elmo dolls, he's second only to big bird. But the last 20 years have been truly bananas: Sesame Street currently rests on Elmo's tiny red shoulders. Elmo's accelerating spread fits fairly well on an exponential model, in fact.
![elmo  model](/assets/sesame_Figure_2.png)

A natural question is: what does the future hold for Sesame Street? We can expect Elmo to appear in 100% of Sesame Street segments by 2028 (95% CI: 2027 to 2032). After that, they will presumably have to introduce a second Elmo, Elmo-β, to appear alongside Elmo-α increasingly often. The show will be saturated with Elmo-β in 2036 (95% CI: 2027 to 2032), at which point Elmo-γ will make his first appearance.

![elmo  forecast](/assets/sesame_Figure_3.png)  


### Methods
Model fitting done with Scipy's curve_fit
\
95% confidence interval was found with a Monte Carlo simulation of possible parameter sets, based on the covariance matrix from curve_fit.
\
\
\
\
![elmo  forecast](/assets/elmo.jpg_large)

