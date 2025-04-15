import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import Replicate from 'replicate'; // Import the Replicate client
import type { Prediction } from 'replicate';
import { createTRPCRouter, publicProcedure } from '@/trpc/server';
// Import sharp
import sharp from 'sharp';
// We'll need a library like 'sharp' or 'resvg' on the server to convert SVG to PNG later
// import sharp from 'sharp'; 

// Initialize Replicate client
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Function to convert SVG string to PNG Data URI using sharp
async function convertSvgToImageDataUri(svgString: string): Promise<string> {
    console.log("AI Router: Converting SVG to PNG Data URI using sharp...");
    try {
        // Ensure SVG has width and height, sharp might need them
        // Basic check, might need more robust parsing
        if (!svgString.includes('width=') || !svgString.includes('height=')) {
            console.warn("SVG string might be missing width/height attributes, attempting conversion anyway.");
            // Potentially inject default size if needed, e.g.:
            // svgString = svgString.replace('<svg ', '<svg width="512" height="512" ');
        }

        const pngBuffer = await sharp(Buffer.from(svgString))
            .resize(512, 512) // Resize to a standard dimension if needed
            .png()
            .toBuffer();

        const dataUri = `data:image/png;base64,${pngBuffer.toString('base64')}`;
        console.log(`AI Router: Conversion successful. Data URI length: ${dataUri.length}`);
        return dataUri;
    } catch (error) {
        console.error("AI Router: Error converting SVG to PNG:", error);
        throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to convert SVG drawing to image for AI processing.',
            cause: error,
        });
    }
}

// Updated function to use predictions.create and wait
async function generateImageWithReplicate(
  imageUri: string, 
  prompt: string,
  scale: number = 9, 
  num_samples: string = "1"
): Promise<string> { 
    const modelVersion = "435061a1b5a4c1e26740464bf786efdfa9cb3a3ac488595a2de23e143fdb0117"; // Extracted version hash
    
    console.log(`AI Router: Creating Replicate prediction for model version ${modelVersion}`);
    console.log(` > Prompt: "${prompt}"`);
    console.log(` > Image URI (post-conversion/placeholder): ${imageUri.substring(0, 50)}...`);

    if (!process.env.REPLICATE_API_TOKEN) {
        console.error("AI Router: REPLICATE_API_TOKEN is not set.");
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Replicate API token not configured on server.' });
    }

    let initialPrediction: Prediction;
    try {
        // Start the prediction
        initialPrediction = await replicate.predictions.create({
            version: modelVersion,
            input: {
                image: imageUri, 
                prompt: prompt,
                scale: scale,
                num_samples: num_samples,
            },
            // Add webhook details here if needed in the future
        });

        console.log(`AI Router: Prediction created with ID: ${initialPrediction.id}, Status: ${initialPrediction.status}`);

        if (initialPrediction.status === 'failed') {
            console.error("AI Router: Prediction failed immediately on creation.", initialPrediction.error);
            // Explicitly convert error to string for Error constructor
            throw new Error(String(initialPrediction.error ?? "Prediction failed immediately."));
        }

        // Wait for the prediction to complete (or fail)
        console.log("AI Router: Waiting for prediction to complete...");
        const finalPrediction = await replicate.wait(initialPrediction, {
             // Optional: Add interval/timeout if needed
             // interval: 1000, // Poll every 1 second (default 500ms)
        }); 

        console.log(`AI Router: Final prediction status: ${finalPrediction.status}`);

        if (finalPrediction.status === 'succeeded') {
            console.log("AI Router: Prediction succeeded. Output:", finalPrediction.output);
            // Validate the final output structure - Check for at least TWO items
            if (Array.isArray(finalPrediction.output) && finalPrediction.output.length > 1) { 
                // *** Get the SECOND item (index 1) ***
                const resultUrl = finalPrediction.output[1]; 
                if (typeof resultUrl === 'string' && (resultUrl.startsWith('http://') || resultUrl.startsWith('https://'))) {
                     console.log("AI Router: Received valid image URL (index 1).");
                     return resultUrl; // Return the SECOND image URL
                } else {
                     console.error("AI Router: Second output item is not a valid string URL:", resultUrl);
                     // Fallback or specific error? Maybe try index 0 if 1 fails?
                     // For now, throw an error indicating the expected item failed.
                     throw new Error("Prediction output[1] string is not a valid URL.");
                }
            } else {
                console.error("AI Router: Prediction succeeded, but output format is unexpected (expected array with at least 2 URLs):", finalPrediction.output);
                // Consider falling back to output[0] if it exists and is valid?
                if (Array.isArray(finalPrediction.output) && finalPrediction.output.length > 0 && typeof finalPrediction.output[0] === 'string') {
                    console.warn("AI Router: Falling back to using output[0] as output[1] was unavailable/invalid.")
                    return finalPrediction.output[0];
                }
                throw new Error("Prediction completed, but did not contain the expected second output URL.");
            }
        } else if (finalPrediction.status === 'failed') {
            console.error("AI Router: Prediction failed.", finalPrediction.error);
            // Force conversion to string for the Error constructor
            const errorDetailString = String(finalPrediction.error ?? "Prediction failed after processing.");
            throw new Error(errorDetailString);
        } else if (finalPrediction.status === 'canceled') {
            console.warn("AI Router: Prediction was canceled.");
            throw new Error("Prediction was canceled.");
        } else {
             console.error(`AI Router: Prediction ended with unexpected status: ${finalPrediction.status}`);
             throw new Error(`Prediction ended with status: ${finalPrediction.status}`);
        }

    } catch (error: unknown) { // Catch errors from create or wait
        console.error("AI Router: Error during prediction lifecycle:", error);
        
        let errorMessage = 'Failed to process image generation request.';
        if (error instanceof Error) {
            errorMessage = error.message;
            // Check for common Replicate API error structure properties
            if (typeof error === 'object' && error !== null && 
                'response' in error && typeof error.response === 'object' && error.response !== null &&
                'data' in error.response && typeof error.response.data === 'object' && error.response.data !== null &&
                'detail' in error.response.data && typeof error.response.data.detail === 'string') {
                errorMessage = error.response.data.detail;
            }
        } else {
            errorMessage = String(error);
        }
        
        throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: errorMessage,
        });
    }
}

export const aiRouter = createTRPCRouter({
  // Revert name, update input schema back to svgString + prompt
  generateImageFromScribble: publicProcedure
    .input(z.object({
        svgString: z.string().min(1, "SVG string cannot be empty"), // Revert to svgString
        prompt: z.string().min(1, "Prompt cannot be empty"),
        scale: z.number().min(0.1).max(30).optional(),
     }))
    .mutation(async ({ input }) => {
      console.log("AI Router: generateImageFromScribble mutation called.");
      console.log(" > Input SVG Length:", input.svgString.length);
      console.log(" > Input Prompt:", input.prompt);

      // *** Convert SVG to image data URI on the server ***
      const imageDataUri = await convertSvgToImageDataUri(input.svgString);

      // Call the actual Replicate function with the converted image URI
      const imageUrl = await generateImageWithReplicate(
        imageDataUri, 
        input.prompt,
        input.scale 
      );

      return { success: true, imageUrl: imageUrl };
    }),
}); 