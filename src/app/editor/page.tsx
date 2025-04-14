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

  // Debounced save function
  const debouncedSave = useCallback(
	debounce((editorInstance: Editor) => {
        if (!editorInstance) return;
		const snapshot = editorInstance.store.getSnapshot();
        console.log("Saving document snapshot...");
        saveDocument(snapshot);
	}, 1000),
	[saveDocument]
  );

  // Effect to load initial data into the editor ONCE
  useEffect(() => {
      // Wait for editor instance AND for data fetch to finish AND ensure it runs only once
      if (!editor || isDataLoadedRef.current || isLoadingDocument) return;

      console.log("Attempting to load initial data...");

      if (isDocumentLoadSuccess) {
          if (initialDocument) {
              // *** Add detailed client-side logging BEFORE loading ***
              console.log("Client: Received initialDocument:", JSON.stringify(initialDocument, null, 2));
              console.log("Client: Type of initialDocument:", typeof initialDocument);
              console.log("Client: Checking schema presence:", initialDocument.hasOwnProperty('schema'));
              if (initialDocument.hasOwnProperty('schema')) {
                  console.log("Client: Type of initialDocument.schema:", typeof initialDocument.schema);
                  console.log("Client: Checking schemaVersion presence:", initialDocument.schema?.hasOwnProperty('schemaVersion'));
                   if (initialDocument.schema?.hasOwnProperty('schemaVersion')) {
                       console.log("Client: schemaVersion value:", initialDocument.schema.schemaVersion);
                   }
              }
              console.log("Client: Checking store presence:", initialDocument.hasOwnProperty('store'));
               if (initialDocument.hasOwnProperty('store')) {
                   console.log("Client: Type of initialDocument.store:", typeof initialDocument.store);
               }

              console.log("Client: Attempting editor.store.loadSnapshot...");
              try {
                  // Ensure we pass a valid TLStoreSnapshot
                  editor.store.loadSnapshot(initialDocument as TLStoreSnapshot);
                  console.log("Client: Initial document loaded successfully.");
              } catch (e) {
                  console.error("Client: Error calling loadSnapshot:", e);
                  // *** Simplify fallback: Just log, don't attempt another load ***
                  console.log("Client: Proceeding with an empty editor due to load error.");
              }
          } else {
              console.log("Client: No initial document found (initialDocument is null/undefined), starting fresh.");
          }
          isDataLoadedRef.current = true; // Mark data load attempt as complete
      } else if (documentError) {
          console.error("Client: Failed to fetch initial document. Starting fresh.", documentError);
          isDataLoadedRef.current = true; // Mark data load attempt as complete (even on error)
      }

  }, [editor, initialDocument, isDocumentLoadSuccess, documentError, isLoadingDocument]); // Dependencies

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

  // Show loading state until the initial data fetch attempt is completed
  if (isLoadingDocument && !isDataLoadedRef.current) {
    return <div className="fixed inset-0 flex items-center justify-center">Loading Editor Data...</div>;
  }

  // Handle explicit document fetch error *before* rendering the editor if data load hasn't been marked complete
  if (documentError && !isDataLoadedRef.current) {
    return <div className="fixed inset-0 flex items-center justify-center text-red-500">Error loading document: {documentError.message}</div>;
  }

  // Render the editor. The useEffect hooks will handle setting up the editor instance,
  // loading data into it, and setting up listeners.
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
        <DynamicTldraw
          // Maybe clear local storage for this key if issues persist
          persistenceKey="tldraw-editor-test-v3"
          onMount={handleMount} // Sets the editor state
        >
          {/* Custom UI - Render only when editor is available */}
          {editor && (
             <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 1000 }}>
                 <Button onClick={handleModifyShape} disabled={isSavingDocument}>
                     {isSavingDocument ? 'Saving...' : 'Modify Shape'}
                 </Button>
                 {saveError && <p className="text-red-500 text-xs mt-1">Save failed</p>}
                 {isSavingDocument && <p className="text-blue-500 text-xs mt-1">Saving...</p>}
                 {/* Show non-blocking note if initial load failed but we proceeded */}
                 {documentError && isDataLoadedRef.current && <p className="text-yellow-500 text-xs mt-1">Note: Failed to load previous state.</p>}
            </div>
          )}
        </DynamicTldraw>
    </div>
  );
} 