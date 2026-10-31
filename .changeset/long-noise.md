---
"plonkjs": patch
"@debuffjp/audio": patch
---

Noise sounds now last as long as their envelope. Before this release a noise instrument (plonk) or noise synth (`audio.synth`) went silent after one second, however long its attack and decay, because the noise buffer was a second long and didn't loop. Wind, rain, surf and other long hisses now play in full.
