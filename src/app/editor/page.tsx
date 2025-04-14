"use client";

import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Editor, TLShapeId, TLStoreSnapshot, Tldraw as TldrawType, track, useEditor, TLRecord } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import { api } from '@/trpc/react';
import { Button } from '@/components/ui/button';

// Dynamically import Tldraw with SSR disabled
const DynamicTldraw = dynamic(async () => (await import('@tldraw/tldraw')).Tldraw, {
  ssr: false,
});

// Debounce function
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	return (...args: Parameters<T>) => {
		const later = () => {
			timeout = null;
			func(...args);
		};
		if (timeout) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(later, wait);
	};
}

export default function EditorPage() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const isDataLoadedRef = useRef(false); // Track if data load attempt completed
  const [isGeneratingImage, setIsGeneratingImage] = useState(false); // State for AI generation loading

  // Fetch initial document - disable more refetches
  const { data: initialDocument, isLoading: isLoadingDocument, error: documentError, isSuccess: isDocumentLoadSuccess } = api.document.getDocument.useQuery(
    undefined,
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false, // Disable reconnect refetch
      retry: 1, // Retry once on error? Or set to false
      staleTime: Infinity, // Data is fresh forever after first fetch
    }
  );

  // Mutation for saving the document
  const { mutate: saveDocument, isLoading: isSavingDocument, error: saveError } = api.document.saveDocument.useMutation({
     onSuccess: () => console.log("Document saved successfully via API."),
     onError: (error) => console.error("Error saving document:", error)
  });

  // *** Add the tRPC mutation hook for AI generation ***
  const generateImageMutation = api.ai.generateImageFromSvg.useMutation({
      onSuccess: (data) => {
          if (data.success && data.imageUrl) {
              console.log("Successfully generated image URL:", data.imageUrl);
              alert(`Image generated! URL: ${data.imageUrl}`); // Replace with better UI

              // Optional: Add image shape to canvas
              if (editor) {
                  const bounds = editor.getSelectionPageBounds();
                  const PADDING = 20;
                  const IMAGE_SIZE = 200; // Example size
                   if (bounds) {
                     editor.createShapes([
                        {
                            type: 'image',
                            x: bounds.maxX + PADDING, // Position to the right of selection
                            y: bounds.y,
                            props: { url: data.imageUrl, w: IMAGE_SIZE, h: IMAGE_SIZE }
                        }
                     ]);
                     // Optional: deselect original shapes
                     editor.selectNone();
                   } else {
                      // Fallback position if no bounds (e.g., page center)
                       editor.createShapes([
                        { type: 'image', x: editor.getViewportPageCenter().x, y: editor.getViewportPageCenter().y, props: { url: data.imageUrl, w: IMAGE_SIZE, h: IMAGE_SIZE } }
                     ]);
                   }
              }


          } else {
              console.error("AI generation failed on server:", data.error);
              alert(`Image generation failed: ${data.error || 'Unknown server error'}`);
          }
           setIsGeneratingImage(false); // End loading state on success/handled error
      },
      onError: (error) => {
          console.error("Error calling generateImage mutation:", error);
          alert(`Image generation failed: ${error.message}`);
          setIsGeneratingImage(false); // End loading state on network/trpc error
      },
  });

  // Debounced save function
  const debouncedSave = useCallback(
	debounce((editorInstance: Editor) => {
        if (!editorInstance) return;
		const snapshot = editorInstance.store.getSnapshot();
        // *** Log the snapshot structure on the client BEFORE sending ***
        console.log("Client: Snapshot before saving:", JSON.stringify(snapshot, null, 2));
        console.log("Saving document snapshot...");
        saveDocument(snapshot);
	}, 1000),
	[saveDocument]
  );

  // Effect to set up the store listener
  useEffect(() => {
    if (!editor) return; // Wait for editor instance

    console.log("Setting up editor listener...");
    const cleanup = editor.store.listen(
        (entry) => {
            if (entry.source !== 'user') return;

            let hasPersistentChange = false;
            const changeDetails = entry.changes.added ?? entry.changes.updated ?? entry.changes.removed;
            if (changeDetails) {
                for (const record of Object.values(changeDetails)) {
                    if (record && !editor.store.isEphemeral(record.typeName)) {
                        hasPersistentChange = true;
                        break;
                    }
                }
            }
            if (!hasPersistentChange) return;

            console.log("Detected user change, preparing to save...");
            debouncedSave(editor);
        },
        { scope: 'record', source: 'user' }
      );

      return () => {
          console.log("Cleaning up editor listener...");
          cleanup(); // Unsubscribe on unmount
      };
  }, [editor, debouncedSave]); // Depend only on editor and the save function

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

  // *** Add handler for Generate Image button ***
  const handleGenerateImage = async () => {
      if (!editor) return;
      const selectedShapes = editor.getSelectedShapes();
      if (selectedShapes.length === 0) {
          alert("Please select some shapes first.");
          return;
      }
      console.log(`Generating image from ${selectedShapes.length} shapes...`);
      setIsGeneratingImage(true); // Start loading state

      try {
          const svgString = await editor.getSvgString(selectedShapes, { scale: 1, background: false });
          if (!svgString) throw new Error("Failed to generate SVG for selected shapes.");

          console.log("Generated SVG:", svgString);
          // Call the tRPC mutation
          generateImageMutation.mutate({ svgString });

      } catch (error) {
          console.error("Error preparing for image generation:", error);
          alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
          setIsGeneratingImage(false); // End loading state if SVG generation fails
      }
      // NOTE: setIsGeneratingImage(false) is now handled by the mutation's onSuccess/onError
  };

  // Render the editor. The useEffect hooks will handle setting up the editor instance,
  // loading data into it, and setting up listeners.
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
        <DynamicTldraw
          persistenceKey="tldraw-editor-test-v4"
          onMount={handleMount}
        >
          {/* Custom UI - Render only when editor is available */}
          {editor && (
             <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 1000, display: 'flex', gap: '8px' }}> {/* Use flex for layout */}
                 <Button onClick={handleModifyShape} disabled={isSavingDocument}>
                     {isSavingDocument ? 'Saving...' : 'Modify Shape'}
                 </Button>
                 <Button
                     onClick={handleGenerateImage}
                     disabled={isGeneratingImage || !editor} // Disable if generating or no editor
                 >
                     {isGeneratingImage ? 'Generating...' : 'Generate Image'}
                 </Button>
                 {/* Status indicators - remove documentError check related to loading */}
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginLeft:'10px' }}>
                     {saveError && <p className="text-red-500 text-xs">Save failed</p>}
                     {isSavingDocument && <p className="text-blue-500 text-xs">Saving...</p>}
                     {generateImageMutation.error && <p className="text-red-500 text-xs">AI Error: {generateImageMutation.error.message}</p>}
                     {/* {documentError && isDataLoadedRef.current && <p className="text-yellow-500 text-xs">Note: Failed to load previous state.</p>} */}
                 </div>
            </div>
          )}
        </DynamicTldraw>
    </div>
  );
} 