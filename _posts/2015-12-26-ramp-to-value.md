---
layout: post
comments: True
title: "Web Audio: the ugly click and the human ear"
tags: [Web audio, JS]
navigation: True
cover: assets/images/mixer.jpg
class: post-template
---

<style>
.button {
    border: none;
    color: white;
    font-weight: bold;
    padding: 10px;
    min-width: 50px;
    min-height: 50px;
    border-radius: 5px;
    position: relative;
    -webkit-appearance: button;
    cursor: pointer;
    text-transform: none;
}

.stop-button {
    background-color: rgb(178, 78, 78);
    border-radius: 5px 0px 0px 5px;
}

.stop-button:hover {
    background-color: rgb(200, 106, 106);
}

.stop-button:before {
    content: "";
    position: absolute;
    left: 15px;
    width: 21px;
    height: 21px;
    margin-top: -10px;
    background: white;
}

.play-button {
    background-color: rgb(103, 178, 78);
    min-width: 100px;
    border-radius: 0px 5px 5px 0px;
}

.play-button:hover {
    background-color: rgb(126, 200, 101);
}

.play-button:before {
    content: "";
    position: absolute;
    left: 38px;
    border: 8px solid transparent;
    border-width: 12px 30px;
    border-left-color: #FFFFFF;
    margin-top: -12px;
    background: transparent;
}
</style>

While playing around with a Web Audio demo, I noticed a clicking sound every time a I stopped an oscillator.

{% highlight javascript %}
var context = new AudioContext();
var oscillatorNode = context.createOscillator();

oscillatorNode.connect(context.destination);

oscillator.start();
oscillator.stop(); // click!
{% endhighlight %}

<button class="button stop-button" id="1-stop-button"></button>
<button class="button play-button" id="1-play-button"></button>
<script>
	var context = new AudioContext();
	var oscillator;
	var firstIsPlaying;
	(function() {
		document.getElementById('1-play-button').addEventListener('click', function() {
			if(firstIsPlaying) return;
			oscillator = context.createOscillator();
			oscillator.connect(context.destination);
			oscillator.start();
			firstIsPlaying = true;
		}, false);
		document.getElementById('1-stop-button').addEventListener('click', function() {
			if (!firstIsPlaying) return;
			oscillator.stop();
			firstIsPlaying = false;
		}, false);		
	})();
</script>

As the noob I am, I wondered why this happened. Could it be an implementation problem on the browser? Not likely, since this happened in all browsers I tested.

Turns out the click sound happens because I'm abruptingly cutting the sound wave at a point other than the natural zero crossing:

<img src="/assets/images/zero-crossing-point.svg">

Is there a way to avoid this clicking sound then?

We have two options:

- Stopping the sound only at zero-point crossings, or
- Creating a node gain to gradually decrease the gain to zero before stopping

I will focus on the second option since - luckily - Web Audio API has us covered. 

## Gradual changes to an audioParam value

### Exponential vs linear

There are several Web Audio functions that can gradually change an audioParam:

{% highlight javascript %}
linearRampToValueAtTime(value, endTime); // linear
exponentialRampToValueAtTime(value, endTime); // exponential
setTargetAtTime(target, startTime, timeConstant); // exponential
{% endhighlight %}

One difference between them is the easing function that is used to change the audio param value; either linear (left) or exponential (right).

<img src="/assets/images/exponential-linear-curves.svg">

Mozilla has a piece of advise to those unsure of which one to use:

>Exponential ramps are considered more useful when changing frequencies or playback rates than linear ramps because of the way the human ear works.

And they are right: the human ear perceives sound on a logarithmic principle. An A3 note is a frequency of 220Hz, whereas A4 is 440Hz and A5 is 880Hz. Loudness also works this way: a tenfold increase in sound power could be described as being twice as loud. Hence, using an exponential gain decrease will be perceived as linear by the human ear.

### exponentialRampToValueAtTime vs setTargetAtTime

We will choose and exponential way of gradually decreasing the gain. This leaves us with ```exponentialRampToValueAtTime``` vs ```setTargetAtTime```. Some difference between them are:

- ```exponentialRampToValueAtTime``` will get to the value precisely at the time specified. However, using this function, an exponential ramp to zero [is not possible](https://webaudio.github.io/web-audio-api/#widl-AudioParam-exponentialRampToValueAtTime-AudioParam-float-value-double-endTime) because of the math used to calculate the values over time. 

- ```setTargetAtTime``` exponentially moves towards the value given by the target parameter, but instead of specifying an end time, we give the function an exponential decay rate after which the value will decrease about 2/3rds. This means we can ask the function to go all the way down to zero. Theoretically it will never really reach zero since it will be exponentially decaying, but in real life it *will* as soon as the value is too small to be represented with a float. 

Let's choose ```setTargetAtTime``` because we want to go all the way down to zero and because we are not too worried about getting there at a super precise time. As long as the fade-out time is fast enough to be imperceptible but slow enough to remove the click, we will be happy.

### Using setTargetAtTime to remove the click

Before trying out ```setTargetAtTime``` to get rid of the ugly click, we must be of a couple gotchas:

- We must choose a decay time after which the gain value will decrease about 2/3rds. After a bit of experimenting, I found out that a decay time of 15 milliseconds gives the impression of being immediate but at the same time removes the click. Remember: Web Audio uses seconds instead of milliseconds!

{% highlight javascript %}
var context = new AudioContext();
var oscillator = context.createOscillator();
var gainNode = context.createGain();

oscillator.connect(gainNode);
gainNode.connect(context.destination)
oscillator.start();

stopButton.addEventListener('click', function() {
    gainNode.gain.setTargetAtTime(0, context.currentTime, 0.015);
});
{% endhighlight %}

<button class="button stop-button" id="2-stop-button"></button>
<button class="button play-button" id="2-play-button"></button>
<script>
	var gainNode;
	var secondIsPlaying;
	(function() {
		document.getElementById('2-play-button').addEventListener('click', function() {
			if(secondIsPlaying) return;
			gainNode = context.createGain();
			oscillator = context.createOscillator();
			oscillator.connect(gainNode);
			gainNode.connect(context.destination);
			oscillator.start();
			secondIsPlaying = true;
		}, false);
		document.getElementById('2-stop-button').addEventListener('click', function() {
			if (!secondIsPlaying) return;
			gainNode.gain.setTargetAtTime(0, context.currentTime, 0.015);
			setTimeout(function() {
				oscillator.stop();
				secondIsPlaying = false;
			}, 40);
		}, false);		
	})();
</script>

There's no more click. We are all happy.

### Using exponentialRampToValueAtTime to remove the click

Since we are at it, let's see how it would've turned out using ```exponentialRampToValueAtTime``` - which I found to be a bit trickier.

One gotcha is this part of the Web Audio specification: 

>(exponentialRampToValueAtTime) Schedules an exponential continuous change in parameter value **from the previous scheduled parameter value** to the given value.

*From the previous scheduled parameter value* means that you must first set the audioParam with an automation method before using the ramping function. This usually means using ```setValueAtTime()``` instead of setting the audioParam value directly (in other words, don't do this: ```gainNode.gain.value = someValue```).

Another gotcha also described in the spec:

>It is an error if either V0 or V1 is not strictly positive. This also implies **an exponential ramp to 0 is not possible.**

So we must choose a tiny value, but not zero. As mentioned earlier, we can't ramp to zero. Also, this time we will use 30 milliseconds as the time for the ramp to occur (this is the total transition time, not the decay time used in ```setTargetAtTime```).

{% highlight javascript %}
var context = new AudioContext();
var oscillator = context.createOscillator();
var gainNode = context.createGain();

oscillator.connect(gainNode);
gainNode.connect(context.destination)

oscillator.start();

stopButton.addEventListener('click', function() {

    // Important! Setting a scheduled parameter value
    gainNode.gain.setValueAtTime(gainNode.gain.value, context.currentTime); 

    gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.03);
});
{% endhighlight %}

<button class="button stop-button" id="3-stop-button"></button>
<button class="button play-button" id="3-play-button"></button>
<script>
	var gainNode;
	var thirdIsPlaying;
	(function() {
		document.getElementById('3-play-button').addEventListener('click', function() {
			if(thirdIsPlaying) return;
			gainNode = context.createGain();
			oscillator = context.createOscillator();
			oscillator.connect(gainNode);
			gainNode.connect(context.destination);
			oscillator.start();
			thirdIsPlaying = true;
		}, false);
		document.getElementById('3-stop-button').addEventListener('click', function() {
			if (!thirdIsPlaying) return;
			gainNode.gain.setValueAtTime(gainNode.gain.value, context.currentTime);
			gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.03);
			setTimeout(function() {
				oscillator.stop();
				thirdIsPlaying = false;
			}, 30);
		}, false);		
	})();
</script>

Also works, we've gotten rid of the click.

## More info

- [The non-linearities of the human ear](http://www.audiocheck.net/soundtests_nonlinear.php)
- [The AudioParam interface](http://www.w3.org/TR/webaudio/#AudioParam)
- [Mozilla's documentation for setTargetAtTime](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime)
- [Mozilla's documentation for exponentialRampToValueAtTime](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/exponentialRampToValueAtTime)

