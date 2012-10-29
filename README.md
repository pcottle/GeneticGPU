# Genetic GPU

Genetic GPU is a non-convex optimization algorithm that uses WebGL to optimize user-inputted functions. It parallelizes both on the GPU and across the network (by making use of multiple GPUs at once).

<img src="http://petercottle.com/gpu1.PNG">

<img src="http://petercottle.com/gpu2.PNG">

## So What?

Uniform sampling of a 2D surface for optimization is not a new idea; Genetic GPU shines when presented with an N-dimensional function to optimize (where N is higher than 2).

In order to optimize this type of function, Genetic GPU randomly distributes a 2D grid of samples into the N-dimensional search space. It then evaluates the fitness of each sample according to the user-inputted function and then projects these samples onto the screen buffer for collection (with the vertical height being the fitness).

With this projection, post-processing can easily extract out the lowest point (sample with best fitness, denoted as a white square on the shader views). The tricky thing is that because of this N-D to 2D projection, the actual location of the sample is lost. Genetic GPU overcomes this obstacle by encoding the position of the sample into the RGB color space of the output buffer.

Since only 3 variables can be encoded at once into the RGB data, Genetic GPU will compile as many shader programs as necessary to extract out all the variables (aka 2 shader programs for 5 variables, 3 shader programs for 7).

After the best sample's position is extracted from the screen buffer, Genetic GPU then 'mutates' this sample in N-dimensions with a pre-defined accuracy and resamples. This improves accuracy and is the namesake of the algorithm.

## Project Writeup

A detailed writeup of the algorithm with all the gory details (compiled for ME202 at UC Berkeley) is available [here](http://petercottle.com/GGPUwriteup.pdf).

## Demo

A hosted interface for the demo is available [here](http://petercottle.com/GeneticGPU/index.html) (webkit only). Note that once the window location gets a room ID appended to it, you can share that link with a friend to divide up the search space and parallelize your optimization.


