
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CanvasElement, ThumbnailData } from '../types';
import { SLOP_ASSETS } from '../constants';
import { Type, Image, StickyNote, Trash2, RotateCw, Undo, Redo, Type as TypeIcon, ChevronsUp, ChevronsDown } from 'lucide-react';

interface CanvasEditorProps {
  fact: string;
  onComplete: (data: ThumbnailData) => void;
}

type DragMode = 'move' | 'resize' | 'rotate' | null;

const FONT_OPTIONS = [
    { label: 'Impact', value: 'Anton' },
    { label: 'Comic', value: 'Comic Neue' },
    { label: 'Loud', value: 'Bangers' },
    { label: 'Fancy', value: 'Lobster' },
    { label: 'Clean', value: 'Inter' },
];

// Polyfill for ID generation to ensure it works in non-secure contexts (http)
const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

const CanvasEditor: React.FC<CanvasEditorProps> = ({ fact, onComplete }) => {
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // History State
  const [history, setHistory] = useState<CanvasElement[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Refs for accessing latest state in event listeners
  const elementsRef = useRef(elements);
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    initialScale: number;
    initialRotation: number;
    centerX: number;
    centerY: number;
  }>({
    mode: null,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
    initialScale: 1,
    initialRotation: 0,
    centerX: 0,
    centerY: 0,
  });

  const canvasRef = useRef<HTMLDivElement>(null);

  // Workspace state
  const [bgColor, setBgColor] = useState<string>('#1a1a1a');
  const [saturation, setSaturation] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);
  const [blur, setBlur] = useState<number>(0);

  // Sync ref with state
  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  // Select all text when entering edit mode
  useEffect(() => {
    if (editingId) {
        // Small timeout to ensure DOM is ready and contentEditable is active
        const timer = setTimeout(() => {
            const el = document.getElementById(`text-edit-${editingId}`);
            if (el) {
                el.focus();
                const range = document.createRange();
                range.selectNodeContents(el);
                const sel = window.getSelection();
                if (sel) {
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            }
        }, 10);
        return () => clearTimeout(timer);
    }
  }, [editingId]);

  // History Helpers
  const addToHistory = useCallback((newElements: CanvasElement[]) => {
    setHistory(prevHistory => {
        const currentHistory = prevHistory.slice(0, historyIndex + 1);
        // Avoid duplicate states
        const lastState = currentHistory[currentHistory.length - 1];
        if (lastState && JSON.stringify(lastState) === JSON.stringify(newElements)) {
            return prevHistory;
        }
        return [...currentHistory, newElements];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setElements(history[newIndex]);
        setSelectedId(null); 
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setElements(history[newIndex]);
        setSelectedId(null);
    }
  }, [history, historyIndex]);

  // Initial setup
  useEffect(() => {
    if (history.length === 0) {
        addText(fact);
    }
    
    // Paste listener
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              if (event.target?.result) {
                addImage(event.target.result as string);
              }
            };
            reader.readAsDataURL(blob);
          }
        }
      }
    };

    // Keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    redo();
                } else {
                    undo();
                }
            } else if (e.key === 'y') {
                e.preventDefault();
                redo();
            }
        }
        // Delete key
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (!editingId && selectedId) {
                deleteSelected();
            }
        }
    };

    window.addEventListener('paste', handlePaste);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
        window.removeEventListener('paste', handlePaste);
        window.removeEventListener('keydown', handleKeyDown);
    };
  }, [undo, redo, selectedId, editingId, history.length, fact]);

  const addText = (initialText: string = "CLICK HERE!") => {
    const newEl: CanvasElement = {
      id: generateId(),
      type: 'text',
      content: initialText,
      x: 150,
      y: 150,
      width: 300, 
      height: 60,
      rotation: 0,
      scale: 1,
      zIndex: elementsRef.current.length + 1,
      color: '#ffffff',
      fontFamily: 'Anton',
      fontSize: 60
    };
    const newElements = [...elementsRef.current, newEl];
    setElements(newElements);
    addToHistory(newElements);
    setSelectedId(newEl.id);
  };

  const addAsset = (asset: any) => {
    const newEl: CanvasElement = {
      id: generateId(),
      type: asset.type,
      content: asset.content,
      x: 350,
      y: 200,
      width: 100,
      height: 100,
      rotation: 0,
      scale: 1,
      zIndex: elementsRef.current.length + 1,
      color: asset.defaultColor || '#ffffff',
      fontFamily: 'Anton',
      fontSize: 60
    };
    const newElements = [...elementsRef.current, newEl];
    setElements(newElements);
    addToHistory(newElements);
    setSelectedId(newEl.id);
  };

  const addImage = (src: string) => {
      // Create an image object to get natural dimensions
      const img = new window.Image();
      img.src = src;
      img.onload = () => {
          // Limit max initial size to prevent it taking over the whole screen
          const maxSize = 300;
          let w = img.width;
          let h = img.height;
          
          if (w > h) {
              if (w > maxSize) {
                  h = h * (maxSize / w);
                  w = maxSize;
              }
          } else {
              if (h > maxSize) {
                  w = w * (maxSize / h);
                  h = maxSize;
              }
          }

          const newEl: CanvasElement = {
            id: generateId(),
            type: 'image',
            content: src,
            x: 400 - (w / 2), // Center X
            y: 225 - (h / 2), // Center Y
            width: w,
            height: h,
            rotation: 0,
            scale: 1,
            zIndex: elementsRef.current.length + 1
          };
          const newElements = [...elementsRef.current, newEl];
          setElements(newElements);
          addToHistory(newElements);
          setSelectedId(newEl.id);
      };
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
           addImage(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const updateElementStateOnly = (id: string, updates: Partial<CanvasElement>) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el));
  };

  const updateElementAndHistory = (id: string, updates: Partial<CanvasElement>) => {
      const newElements = elementsRef.current.map(el => el.id === id ? { ...el, ...updates } : el);
      setElements(newElements);
      addToHistory(newElements);
  };

  const deleteSelected = () => {
    if (selectedId) {
      const newElements = elementsRef.current.filter(el => el.id !== selectedId);
      setElements(newElements);
      addToHistory(newElements);
      setSelectedId(null);
    }
  };

  // --- LAYER MANAGEMENT ---
  const bringToFront = () => {
    if (!selectedId) return;
    const maxZ = Math.max(...elements.map(e => e.zIndex), 0);
    updateElementAndHistory(selectedId, { zIndex: maxZ + 1 });
  };

  const sendToBack = () => {
    if (!selectedId) return;
    const minZ = Math.min(...elements.map(e => e.zIndex), 0);
    updateElementAndHistory(selectedId, { zIndex: minZ - 1 });
  };

  // --- MOUSE INTERACTIONS ---

  const handleMouseDown = (e: React.MouseEvent, id: string, mode: DragMode) => {
    if (editingId) return; 
    e.stopPropagation();

    const el = elements.find(e => e.id === id);
    if (!el) return;

    setSelectedId(id);
    
    // For text, the width/height isn't fixed, but visual center matters
    const centerX = el.x + (el.width * el.scale) / 2;
    const centerY = el.y + (el.height * el.scale) / 2;

    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      initialX: el.x,
      initialY: el.y,
      initialScale: el.scale,
      initialRotation: el.rotation,
      centerX,
      centerY,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const { mode, startX, startY, initialX, initialY, initialScale, initialRotation, centerX, centerY } = dragRef.current;
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      if (mode === 'move') {
        updateElementStateOnly(id, { x: initialX + dx, y: initialY + dy });
      } else if (mode === 'resize') {
        const sensitivity = 0.005;
        const delta = (dx + dy) * sensitivity; 
        const newScale = Math.max(0.1, initialScale + delta);
        updateElementStateOnly(id, { scale: newScale });
      } else if (mode === 'rotate') {
        const startAngle = Math.atan2(startY - centerY, startX - centerX);
        const currentAngle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
        const rotationDelta = (currentAngle - startAngle) * (180 / Math.PI);
        // INVERSED rotation based on user request
        updateElementStateOnly(id, { rotation: initialRotation + rotationDelta }); 
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      dragRef.current.mode = null;
      addToHistory(elementsRef.current);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleDoubleClick = (id: string, type: string) => {
      if (type === 'text') {
          setEditingId(id);
      }
  };

  // --- RENDER HELPERS ---

  const renderTransformControls = (el: CanvasElement) => {
    if (selectedId !== el.id || editingId === el.id) return null;

    const handleStyle = "w-4 h-4 bg-white border-2 border-blue-500 rounded-full absolute pointer-events-auto shadow-sm hover:scale-125 transition-transform z-50";
    
    return (
      <>
        {/* Border */}
        <div 
            className="absolute inset-0 border-2 border-blue-500 pointer-events-none" 
            style={{ width: '100%', height: '100%' }}
        />
        
        {/* Resize Handle (Bottom Right) */}
        <div 
            className={`${handleStyle} cursor-nwse-resize`}
            style={{ right: -8, bottom: -8 }}
            onMouseDown={(e) => handleMouseDown(e, el.id, 'resize')}
        />

        {/* Rotate Handle (Top Center stick) */}
        <div 
            className="absolute left-1/2 -translate-x-1/2 -top-8 w-px h-8 bg-blue-500 pointer-events-none"
        />
        <div 
            className={`${handleStyle} cursor-grab active:cursor-grabbing bg-blue-500`}
            style={{ left: '50%', top: -40, transform: 'translateX(-50%)' }}
            onMouseDown={(e) => handleMouseDown(e, el.id, 'rotate')}
        >
             <RotateCw size={10} className="text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
      </>
    );
  };

  const renderElement = (el: CanvasElement) => {
    const isSelected = selectedId === el.id;
    const isEditing = editingId === el.id;

    const style: React.CSSProperties = {
      position: 'absolute',
      left: el.x,
      top: el.y,
      width: el.type === 'text' ? 'auto' : el.width * el.scale,
      height: el.type === 'text' ? 'auto' : el.height * el.scale,
      transform: `rotate(${el.rotation}deg)`,
      zIndex: el.zIndex,
      cursor: isEditing ? 'text' : 'move',
      touchAction: 'none'
    };

    // Helper to safely replace colors in SVG without overwriting 'none' or 'transparent'
    const getColoredContent = (content: string, color: string) => {
        return content
            .replace(/currentColor/g, color)
            .replace(/fill="([^"]*)"/g, (match, val) => {
                if (val === 'none' || val === 'transparent') return match;
                return `fill="${color}"`;
            })
            .replace(/stroke="([^"]*)"/g, (match, val) => {
                if (val === 'none' || val === 'transparent') return match;
                return `stroke="${color}"`;
            });
    };

    return (
        <div 
            key={el.id} 
            style={style}
            onMouseDown={(e) => handleMouseDown(e, el.id, 'move')}
            onDoubleClick={() => handleDoubleClick(el.id, el.type)}
            className="group"
        >
             <div className="relative w-full h-full">
                {el.type === 'text' ? (
                    <div 
                        id={`text-edit-${el.id}`}
                        className={`uppercase leading-none drop-shadow-[0_5px_5px_rgba(0,0,0,0.8)] whitespace-nowrap`}
                        style={{ 
                            color: el.color,
                            fontSize: `${el.fontSize || 60}px`,
                            fontFamily: el.fontFamily || 'Anton',
                            transform: `scale(${el.scale})`,
                            transformOrigin: 'top left',
                            minWidth: '20px',
                            outline: isEditing ? '2px dashed yellow' : 'none'
                        }}
                        contentEditable={isEditing}
                        suppressContentEditableWarning
                        onBlur={(e) => {
                            const newContent = e.currentTarget.textContent || '';
                            if (newContent !== el.content) {
                                updateElementAndHistory(el.id, { content: newContent });
                            }
                            setEditingId(null);
                        }}
                        onKeyDown={(e) => {
                           if (e.key === 'Enter' && !e.shiftKey) {
                               e.preventDefault();
                               e.currentTarget.blur();
                           }
                        }}
                    >
                        {el.content}
                    </div>
                ) : el.type === 'image' ? (
                    <img 
                        src={el.content} 
                        className="w-full h-full object-contain drop-shadow-xl pointer-events-none select-none bg-transparent"
                    />
                ) : (
                    <div 
                        className="w-full h-full pointer-events-none select-none"
                        style={{ color: el.color || 'red' }} 
                        dangerouslySetInnerHTML={{__html: getColoredContent(el.content, el.color || 'red') }} 
                    />
                )}

                {isSelected && !isEditing && renderTransformControls(el)}
             </div>
        </div>
    );
  };

  const getSelectedElement = () => elements.find(el => el.id === selectedId);
  const selectedElement = getSelectedElement();

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      {/* Toolbar */}
      <div className="h-16 bg-gray-800 border-b border-gray-700 flex items-center px-4 gap-4 overflow-x-auto shrink-0 z-20">
        <div className="flex items-center gap-1 border-r border-gray-600 pr-4 mr-2">
            <button 
                onClick={undo} 
                disabled={historyIndex <= 0}
                className="p-2 hover:bg-gray-700 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                title="Undo (Ctrl+Z)"
            >
                <Undo size={18} />
            </button>
            <button 
                onClick={redo} 
                disabled={historyIndex >= history.length - 1}
                className="p-2 hover:bg-gray-700 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                title="Redo (Ctrl+Y)"
            >
                <Redo size={18} />
            </button>
        </div>

        <button onClick={() => addText("NEW TEXT")} className="flex flex-col items-center gap-1 text-xs hover:text-yellow-400 min-w-[60px]">
          <Type size={20} /> Text
        </button>
        <label className="flex flex-col items-center gap-1 text-xs hover:text-yellow-400 cursor-pointer min-w-[60px]">
          <Image size={20} /> Upload
          <input type="file" onChange={handleImageUpload} className="hidden" accept="image/*" />
        </label>
        
        <div className="w-px h-8 bg-gray-600 mx-2"></div>
        
        {SLOP_ASSETS.map(asset => (
           <button key={asset.id} onClick={() => addAsset(asset)} className="flex flex-col items-center gap-1 text-xs hover:text-yellow-400 min-w-[60px]">
             {asset.type === 'text' ? (
                <span className="text-xl">{asset.content}</span>
             ) : (
                <div 
                  className="w-6 h-6 flex items-center justify-center"
                  dangerouslySetInnerHTML={{ 
                      __html: asset.content
                          .replace(/width="[^"]*"/, 'width="100%"')
                          .replace(/height="[^"]*"/, 'height="100%"')
                          .replace(/stroke="[^"]*"/g, 'stroke="white"')
                          .replace(/fill="currentColor"/g, 'fill="white"')
                          .replace(/fill="none"/g, 'fill="none"') // Ensure none stays none
                  }} 
                />
             )}
             <span className="truncate w-full text-center">{asset.name}</span>
           </button>
        ))}

        <div className="w-px h-8 bg-gray-600 mx-2"></div>

        {selectedElement && (
            <div className="flex gap-4 items-center animate-in fade-in slide-in-from-top-4 duration-200 bg-gray-700/50 p-2 rounded-lg">
                 {/* Color Picker */}
                 <div className="flex flex-col items-center">
                    <input 
                        type="color" 
                        value={selectedElement.color || '#ffffff'}
                        onChange={(e) => updateElementAndHistory(selectedElement.id, { color: e.target.value })}
                        className="w-8 h-8 rounded cursor-pointer bg-transparent border-none"
                        title="Change Color"
                    />
                 </div>

                 <div className="w-px h-8 bg-gray-500 mx-1"></div>

                 {/* Layer Controls */}
                 <div className="flex flex-col gap-1">
                    <button onClick={bringToFront} className="p-1 hover:bg-gray-600 rounded text-xs flex items-center gap-1" title="Bring to Front">
                         <ChevronsUp size={14} /> 
                    </button>
                    <button onClick={sendToBack} className="p-1 hover:bg-gray-600 rounded text-xs flex items-center gap-1" title="Send to Back">
                         <ChevronsDown size={14} /> 
                    </button>
                 </div>

                 {/* Text Specific Controls */}
                 {selectedElement.type === 'text' && (
                    <>
                        <div className="w-px h-8 bg-gray-500 mx-1"></div>
                        <div className="flex flex-col gap-1">
                            <select 
                                className="bg-gray-900 border border-gray-600 text-xs rounded px-1 py-1 w-24"
                                value={selectedElement.fontFamily || 'Anton'}
                                onChange={(e) => updateElementAndHistory(selectedElement.id, { fontFamily: e.target.value })}
                            >
                                {FONT_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                            <div className="flex items-center gap-1">
                                <span className="text-[10px] text-gray-400">Size</span>
                                <input 
                                    type="number" 
                                    min="10" 
                                    max="500"
                                    value={selectedElement.fontSize || 60} 
                                    onChange={(e) => updateElementAndHistory(selectedElement.id, { fontSize: Number(e.target.value) })}
                                    className="w-14 bg-gray-900 border border-gray-600 text-xs rounded px-1 py-0.5"
                                />
                            </div>
                        </div>
                    </>
                 )}

                 <div className="w-px h-8 bg-gray-500 mx-1"></div>

                 <button onClick={deleteSelected} className="p-2 bg-red-900/80 text-red-300 rounded hover:bg-red-800" title="Delete">
                    <Trash2 size={16}/>
                 </button>
            </div>
        )}
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Controls */}
        <div className="w-64 bg-gray-800 p-4 border-r border-gray-700 flex flex-col gap-6 overflow-y-auto shrink-0 z-10">
            <div>
                <h3 className="text-sm font-bold text-gray-400 mb-2 uppercase">Background</h3>
                <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-full h-10 rounded cursor-pointer"/>
            </div>
            <div>
                <h3 className="text-sm font-bold text-gray-400 mb-2 uppercase">Slop Filters</h3>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs flex justify-between">Saturation <span>{saturation}%</span></label>
                        <input type="range" min="0" max="400" value={saturation} onChange={(e) => setSaturation(Number(e.target.value))} className="w-full accent-yellow-500"/>
                    </div>
                    <div>
                        <label className="text-xs flex justify-between">Contrast <span>{contrast}%</span></label>
                        <input type="range" min="50" max="200" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} className="w-full accent-yellow-500"/>
                    </div>
                    <div>
                        <label className="text-xs flex justify-between">Blur <span>{blur}px</span></label>
                        <input type="range" min="0" max="20" value={blur} onChange={(e) => setBlur(Number(e.target.value))} className="w-full accent-yellow-500"/>
                    </div>
                </div>
            </div>
            <div className="mt-auto">
                <button 
                  onClick={() => onComplete({ canvasState: elements, bgColor, filterContrast: contrast, filterSaturation: saturation, filterBlur: blur })}
                  className="w-full py-4 bg-green-600 hover:bg-green-500 text-white font-black uppercase tracking-wider text-xl rounded-lg shadow-[0_4px_0_rgb(20,83,45)] active:shadow-none active:translate-y-[4px] transition-all"
                >
                    PUBLISH VIDEO
                </button>
            </div>
        </div>

        {/* Canvas Area */}
        <div 
          className="flex-1 bg-gray-900 relative flex items-center justify-center p-8 overflow-hidden select-none"
          onMouseDown={() => {
              if (!editingId) setSelectedId(null);
          }}
        >
            <div 
              ref={canvasRef}
              className="relative shadow-2xl overflow-hidden"
              style={{
                  width: '800px',
                  height: '450px', // 16:9 Aspect Ratio
                  backgroundColor: bgColor,
                  filter: `saturate(${saturation}%) contrast(${contrast}%) blur(${blur}px)`,
              }}
            >
                {elements.map(renderElement)}
            </div>
        </div>
      </div>
    </div>
  );
};

export default CanvasEditor;
