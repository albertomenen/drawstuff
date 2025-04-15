"use client";

import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Editor, TLShapeId,  TLRecord } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import { api } from '@/trpc/react';
import { Button } from '@/components/ui/button';

// Dynamically import Tldraw with SSR disabled
const DynamicTldraw = dynamic(async () => (await import('@tldraw/tldraw')).Tldraw, {
  ssr: false,
});

// Debounce function - Add specific type for Editor callback
function debounce<T extends (editor: Editor) => void>(func: T, wait: number): T {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	return ((editor: Editor) => {
		const later = () => {
			timeout = null;
			func(editor);
		};
		if (timeout) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(later, wait);
	}) as T; // Cast back to original type T
}

export default function EditorPage() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [userPrompt, setUserPrompt] = useState("make a crazy version of that draw");
  // Ref to store IDs of shapes used for generation
  const generatingShapeIdsRef = useRef<TLShapeId[]>([]);

  // Fetch initial document - call query without destructuring unused variables
  api.document.getDocument.useQuery(
    undefined,
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
      staleTime: Infinity,
    }
  );

  // Mutation for saving the document
  const { mutate: saveDocument, isPending: isSavingDocument, error: saveError } = api.document.saveDocument.useMutation({
     onSuccess: () => console.log("Document saved successfully via API."),
     onError: (error) => console.error("Error saving document:", error)
  });

  // *** Mutation hook for generateImageFromScribble ***
  const generateImageMutation = api.ai.generateImageFromScribble.useMutation({
      onSuccess: (data) => {
          if (data.success && data.imageUrl) {
              console.log("Successfully generated image URL:", data.imageUrl);
              alert(`Image generated! URL: ${data.imageUrl}`);

              if (editor && generatingShapeIdsRef.current.length > 0) {
                  const idsToDelete = generatingShapeIdsRef.current;
                  
                  // Workaround: Select shapes to get their combined bounds
                  editor.select(...idsToDelete);
                  const bounds = editor.getSelectionPageBounds(); 
                  editor.selectNone(); // Deselect immediately
                  
                  // *** Log the calculated bounds ***
                  console.log("Calculated bounds for replacement:", bounds);

                  if (!bounds) { 
                      console.error("Could not calculate bounds for original shapes.");
                      // Handle error or fallback (e.g., place image at center)
                      setIsGeneratingImage(false); // Ensure loading state is off
                      generatingShapeIdsRef.current = [];
                      return; 
                  }

                  // Delete the original shapes
                  console.log("Replacing original shapes with generated image:", idsToDelete);
                  editor.deleteShapes(idsToDelete);
                  
                  // *** Log the properties before creating the shape ***
                  const imageShapeProps = {
                      type: 'image' as const, // Ensure type is literal
                      x: bounds.minX,
                      y: bounds.minY,
                      props: { 
                          url: data.imageUrl, 
                          w: bounds.width,
                          h: bounds.height,
                      }
                  };
                  console.log("Creating image shape with props:", imageShapeProps);

                  // Create the new image shape at the original position and size
                  editor.createShapes([imageShapeProps]); // Use the logged props
                  
                  editor.selectNone();
                  generatingShapeIdsRef.current = []; // Clear the ref
              } else {
                   console.warn("Editor not available or no shape IDs stored after generation.")
                   // Fallback: add image to center if originals can't be replaced
                    if (editor) {
                        editor.createShapes([
                            { type: 'image', x: editor.getViewportScreenCenter().x - 100, y: editor.getViewportScreenCenter().y - 100, props: { url: data.imageUrl, w: 200, h: 200 } }
                        ]);
                    }
              }
          } else {
              console.error("AI generation failed on server (success: false).");
              alert(`Image generation failed: Unknown server error`); 
          }
           setIsGeneratingImage(false);
      },
      onError: (error) => {
          console.error("Error calling generateImage mutation:", error);
          alert(`Image generation failed: ${error.message}`);
          setIsGeneratingImage(false);
          generatingShapeIdsRef.current = []; // Clear ref on error too
      },
  });

  // Debounced save function - Use specific type
  const debouncedSave = useCallback(
	debounce((editorInstance: Editor) => {
        if (!editorInstance) return;
		const snapshot = editorInstance.store.getSnapshot();
        console.log("Client: Snapshot before saving:", JSON.stringify(snapshot, null, 2));
        console.log("Saving document snapshot...");
        saveDocument(snapshot);
	}, 1000),
	[saveDocument]
  );

  // Effect to set up the store listener - Use alternative ephemeral check
  useEffect(() => {
    if (!editor) return; 

    console.log("Setting up editor listener...");
    const cleanup = editor.store.listen(
        (entry) => {
            if (entry.source !== 'user') return;

            let hasPersistentChange = false;
            const changeDetails = entry.changes.added ?? entry.changes.updated ?? entry.changes.removed;
            if (changeDetails) {
                for (const record of Object.values(changeDetails)) {
                    // Simplified ephemeral check: persistent records likely don't start with 'shape:'
                    // This might need refinement based on exact tldraw v2 ephemeral types
                    if (record && record.typeName && !record.typeName.startsWith('shape:')) { 
                        hasPersistentChange = true;
                        break;
                    }
                }
            }
            if (!hasPersistentChange) return;

            console.log("Detected user change, preparing to save...");
            debouncedSave(editor);
        },
        { scope: 'all', source: 'user' } 
      );

      return () => {
          console.log("Cleaning up editor listener...");
          cleanup(); 
      };
  }, [editor, debouncedSave]);

  // Simple callback to set the editor instance state when tldraw mounts
  const handleMount = useCallback((editorInstance: Editor) => {
      console.log("Tldraw component mounted, setting editor instance.");
      setEditor(editorInstance);
  }, []); // No dependencies

  // Function to modify a shape
  const handleModifyShape = () => {
    if (!editor) return;

    const selectedShapes = editor.getSelectedShapes();
    let targetShape: TLRecord | undefined;

    if (selectedShapes.length > 0) {
      targetShape = selectedShapes[0]; // Use the selected shape directly
    } else {
       const allShapes = editor.getCurrentPageShapes();
       if (allShapes.length > 0) {
           targetShape = allShapes[0];
       }
    }

    if (targetShape) {
        const shapeToUpdate = editor.getShape(targetShape.id as TLShapeId); // Get full shape data
        if (!shapeToUpdate) return;

       console.log(`Modifying shape: ${shapeToUpdate.id}`);
       // Example: Change color prop if it exists, otherwise position
       const newProps = { ...shapeToUpdate.props };
       if ('color' in newProps) {
           newProps.color = newProps.color === 'blue' ? 'red' : 'blue'; // Toggle color
           editor.updateShapes([{ id: shapeToUpdate.id as TLShapeId, type: shapeToUpdate.type, props: newProps }]);
       } else {
            // Move shape slightly
            editor.updateShapes([{ id: shapeToUpdate.id as TLShapeId, type: shapeToUpdate.type, x: shapeToUpdate.x + 10 }]);
       }
    } else {
       console.log("No suitable shape found to modify. Creating one.");
       // Create a default shape
       editor.createShapes([{ type: 'geo', x: 100, y: 100, props: { geo: 'rectangle', w: 100, h: 100, color: 'blue' } }]);
    }
  };

  // *** Updated Handler for Generate Image button ***
  const handleGenerateImage = async () => {
      if (!editor) return;

      console.log(`Generating image from current page content with prompt: "${userPrompt}"`);
      setIsGeneratingImage(true);
      generatingShapeIdsRef.current = []; // Clear previous IDs

      try {
          const allShapes = editor.getCurrentPageShapes();
          if (allShapes.length === 0) {
              alert("Canvas is empty. Please draw something first.");
              setIsGeneratingImage(false);
              return;
          }

          // *** Store the IDs of the shapes being used ***
          generatingShapeIdsRef.current = allShapes.map(shape => shape.id);

          // Get SVG string (as before)
          const svgExportResult = await editor.getSvgString(allShapes, {
              scale: 1,
              background: editor.user.getIsDarkMode() ? true : undefined,
              darkMode: editor.user.getIsDarkMode()
          });

          const svgString = svgExportResult?.svg;
          if (!svgString) {
              throw new Error("Failed to generate SVG string from canvas content.");
          }

          console.log(`Generated SVG string (length: ${svgString.length})`);

          const mutationPayload = { 
              svgString: svgString, 
              prompt: userPrompt 
          };
          console.log("Client: Calling generateImageFromScribble mutation...", { prompt: userPrompt });

          generateImageMutation.mutate(mutationPayload);

      } catch (error) {
          console.error("Error preparing for image generation:", error);
          alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
          setIsGeneratingImage(false);
          generatingShapeIdsRef.current = []; // Clear ref on error
      }
  };

  // Render the editor. The useEffect hooks will handle setting up the editor instance,
  // loading data into it, and setting up listeners.
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
        <DynamicTldraw
          persistenceKey="tldraw-editor-test-v4"
          onMount={handleMount}
        >
          {/* Custom UI */}
          {editor && (
             <div style={{ 
                 position: 'absolute', 
                 top: 10, 
                 left: 10, 
                 zIndex: 1000, 
                 display: 'flex', 
                 gap: '8px', 
                 backgroundColor: 'rgba(255, 255, 255, 0.8)', // Add slight background for readability
                 padding: '5px', 
                 borderRadius: '4px' 
             }}>
                 <Button onClick={handleModifyShape} disabled={isSavingDocument || isGeneratingImage}>
                     {isSavingDocument ? 'Saving...' : 'Modify Shape'}
                 </Button>
                 <input 
                     type="text"
                     value={userPrompt}
                     onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserPrompt(e.target.value)}
                     placeholder="Enter your prompt..."
                     disabled={isGeneratingImage}
                     style={{width: '300px', padding: '5px', border: '1px solid #ccc', borderRadius: '4px'}} // Basic styling
                 />
                 <Button
                     onClick={handleGenerateImage}
                     disabled={isGeneratingImage || !editor || !userPrompt}
                 >
                     {isGeneratingImage ? 'Generating...' : 'Generate Scribble'}
                 </Button>
                 {/* Status indicators */} 
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginLeft:'10px', justifyContent: 'center' }}>
                     {saveError && <p className="text-red-500 text-xs">Save failed</p>}
                     {isSavingDocument && <p className="text-blue-500 text-xs">Saving...</p>}
                     {generateImageMutation.error && <p className="text-red-500 text-xs">AI Error: {generateImageMutation.error.message}</p>}
                 </div>
            </div>
          )}
        </DynamicTldraw>
    </div>
  );
} 