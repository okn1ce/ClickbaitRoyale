
import React, { useState, useEffect, useRef } from 'react';
import { GamePhase, Player, RoundData, ThumbnailData, GameState, NetworkMessage } from './types';
import CanvasEditor from './components/CanvasEditor';
import { Sparkles, Play, RotateCcw, ThumbsUp, Users, Loader2, Copy, Trophy, Crown, AlertCircle, ChevronRight } from 'lucide-react';
import { COLORS } from './constants';

// Declare PeerJS globally
declare const Peer: any;

const App: React.FC = () => {
  // --- LOCAL STATE ---
  const [myPeerId, setMyPeerId] = useState<string>('');
  const [myName, setMyName] = useState<string>('');
  const [hostId, setHostId] = useState<string>(''); // If empty, I might be host or not connected
  const [isHost, setIsHost] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // --- GAME STATE (Synced) ---
  const [gameState, setGameState] = useState<GameState>({
    phase: GamePhase.LOBBY,
    players: [],
    roundData: []
  });

  // --- LOCAL GAMEPLAY STATE ---
  const [myFact, setMyFact] = useState('');
  const [myAssignedFact, setMyAssignedFact] = useState<RoundData | null>(null);

  // --- REFS FOR NETWORK ---
  const peerRef = useRef<any>(null);
  const connectionsRef = useRef<Map<string, any>>(new Map()); // Host uses this to track clients
  const hostConnectionRef = useRef<any>(null); // Client uses this to talk to host
  const isHostRef = useRef(false); // Ref to access latest isHost value inside callbacks

  // Sync ref with state
  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  // --- INITIALIZATION ---
  useEffect(() => {
    const peer = new Peer(null, {
      debug: 2
    });

    peer.on('open', (id: string) => {
      console.log('My Peer ID is: ' + id);
      setMyPeerId(id);
      setErrorMsg(null);
    });

    peer.on('error', (err: any) => {
        console.error('Peer error:', err);
        setIsJoining(false);
        if (err.type === 'peer-unavailable') {
            setErrorMsg(`Room "${joinCodeInput}" not found. Check the code.`);
        } else {
            setErrorMsg(`Connection error: ${err.type}`);
        }
    });

    peer.on('connection', (conn: any) => {
      // HANDLE INCOMING CONNECTION (As Host usually)
      conn.on('data', (data: NetworkMessage) => {
        handleNetworkMessage(data, conn.peer);
      });
      
      conn.on('open', () => {
         // If I am host, add to connections
         // Use Ref because closure captures initial state
         if (isHostRef.current) {
             connectionsRef.current.set(conn.peer, conn);
             
             // Automatically sync state to new joiner
             // We need to access the LATEST gameState here. 
             // Ideally we should have gameState in a ref too, but for now 
             // let's rely on the Client sending a JOIN message to trigger a broadcast.
         } else {
             // If I'm not a host, I shouldn't really be accepting random connections 
             // unless it's P2P logic, but here we are Star topology.
             // We can close it or ignore.
         }
      });

      conn.on('close', () => {
          if (isHostRef.current) {
              connectionsRef.current.delete(conn.peer);
              // Optionally remove player from state, or keep them as disconnected
          }
      });
    });

    peerRef.current = peer;

    return () => {
      peer.destroy();
    };
  }, []); // Run ONCE. Do not destroy peer when isHost changes.

  // --- HOST LOGIC: BROADCAST ---
  const broadcastState = (newState: GameState) => {
    // Update local state first
    setGameState(newState);
    
    // Send to all connected peers
    const msg: NetworkMessage = { type: 'STATE_UPDATE', payload: newState };
    connectionsRef.current.forEach(conn => {
        if (conn.open) conn.send(msg);
    });
  };

  // --- CLIENT LOGIC: SEND TO HOST ---
  const sendToHost = (msg: NetworkMessage) => {
     if (isHost) {
         // I am host, handle locally
         handleNetworkMessage(msg, myPeerId);
     } else {
         if (hostConnectionRef.current && hostConnectionRef.current.open) {
             hostConnectionRef.current.send(msg);
         } else {
             console.warn("Cannot send to host, connection closed");
         }
     }
  };

  // --- MESSAGE HANDLER (Central Logic Hub) ---
  const handleNetworkMessage = (msg: NetworkMessage, senderId: string) => {
    // Client handling State Updates
    if (msg.type === 'STATE_UPDATE') {
        setGameState(msg.payload);
        return;
    }

    // HOST LOGIC BELOW
    if (!isHostRef.current) return; 

    // We need to work with the LATEST state.
    // Since this is inside a callback, 'gameState' might be stale if we aren't careful.
    // However, React state setters accept a function. But we need to READ the state to modify it properly.
    // For this simple app, we will use the setState callback pattern where possible, 
    // OR we can use a ref for gameState. 
    // For complex logic like "check if all submitted", we need the current list.
    
    setGameState(currentState => {
        const currentPlayers = [...currentState.players];
        let newState = { ...currentState };
        let shouldBroadcast = false;

        switch (msg.type) {
            case 'JOIN':
                // Check if player exists
                if (!currentPlayers.find(p => p.id === senderId)) {
                    const newPlayer: Player = {
                        id: senderId,
                        name: msg.payload.name,
                        avatarColor: msg.payload.avatarColor,
                        score: 0,
                        isHost: false,
                        hasSubmitted: false
                    };
                    newState.players = [...currentPlayers, newPlayer];
                    shouldBroadcast = true;
                } else {
                     // Re-join logic (if needed), update name maybe?
                     shouldBroadcast = true; // Send current state back to them
                }
                break;
            
            case 'START_GAME':
                 if (newState.phase === GamePhase.LOBBY) {
                    newState.phase = GamePhase.INPUT;
                    shouldBroadcast = true;
                 }
                 break;

            case 'SUBMIT_FACT':
                 {
                    const playerIndex = currentPlayers.findIndex(p => p.id === senderId);
                    if (playerIndex !== -1) {
                        // Update player submission status
                        const updatedPlayers = [...currentPlayers];
                        updatedPlayers[playerIndex] = { ...updatedPlayers[playerIndex], hasSubmitted: true };
                        newState.players = updatedPlayers;
                        
                        // Update Round Data
                        let newRounds = [...newState.roundData];
                        const existingRoundIdx = newRounds.findIndex(r => r.ownerId === senderId);
                        
                        const roundEntry: RoundData = {
                            originalFact: msg.payload.fact,
                            ownerId: senderId,
                            ownerName: updatedPlayers[playerIndex].name,
                            assignedToPlayerId: '', // Pending
                            votes: 0
                        };

                        if (existingRoundIdx >= 0) {
                            newRounds[existingRoundIdx] = roundEntry;
                        } else {
                            newRounds.push(roundEntry);
                        }
                        newState.roundData = newRounds;
                        shouldBroadcast = true;

                        // Check transition
                        if (updatedPlayers.every(p => p.hasSubmitted)) {
                             // TRANSITION TO NEXT PHASE
                             const resetPlayers = updatedPlayers.map(p => ({...p, hasSubmitted: false}));
                             newState.players = resetPlayers;
                             newState.phase = GamePhase.SWAP;

                             // Assign Rounds
                             const assignedRounds = newRounds.map((round, idx) => {
                                const ownerIdx = resetPlayers.findIndex(p => p.id === round.ownerId);
                                const assigneeIdx = (ownerIdx + 1) % resetPlayers.length;
                                return { ...round, assignedToPlayerId: resetPlayers[assigneeIdx].id };
                             });
                             newState.roundData = assignedRounds;

                             // Delayed transition to EDIT
                             setTimeout(() => {
                                broadcastState({
                                    ...newState,
                                    phase: GamePhase.EDIT,
                                    roundData: assignedRounds // Explicitly include rounds to be safe
                                });
                             }, 4000);
                        }
                    }
                 }
                 break;

            case 'SUBMIT_THUMBNAIL':
                 {
                     const pIdx = currentPlayers.findIndex(p => p.id === senderId);
                     if (pIdx !== -1) {
                        const updatedPlayers = [...currentPlayers];
                        updatedPlayers[pIdx] = { ...updatedPlayers[pIdx], hasSubmitted: true };
                        newState.players = updatedPlayers;

                        const updatedRounds = newState.roundData.map(r => {
                            if (r.assignedToPlayerId === senderId) {
                                return { ...r, thumbnail: msg.payload.thumbnail };
                            }
                            return r;
                        });
                        newState.roundData = updatedRounds;
                        shouldBroadcast = true;

                        if (updatedPlayers.every(p => p.hasSubmitted)) {
                            const resetPlayers = updatedPlayers.map(p => ({...p, hasSubmitted: false}));
                            newState.players = resetPlayers;
                            // Transition to PRESENTATION first, then VOTE
                            newState.phase = GamePhase.PRESENTATION;
                            newState.presentationIndex = 0;
                        }
                     }
                 }
                 break;

            case 'VOTE':
                {
                    const pIdx = currentPlayers.findIndex(p => p.id === senderId);
                    if (pIdx !== -1) {
                        const updatedPlayers = [...currentPlayers];
                        updatedPlayers[pIdx] = { ...updatedPlayers[pIdx], hasSubmitted: true };
                        newState.players = updatedPlayers;

                        const votedRounds = [...newState.roundData];
                        if (votedRounds[msg.payload.roundIndex]) {
                            votedRounds[msg.payload.roundIndex] = {
                                ...votedRounds[msg.payload.roundIndex],
                                votes: votedRounds[msg.payload.roundIndex].votes + 1
                            };
                        }
                        newState.roundData = votedRounds;
                        shouldBroadcast = true;

                        if (updatedPlayers.every(p => p.hasSubmitted)) {
                            const resetPlayers = updatedPlayers.map(p => ({...p, hasSubmitted: false}));
                            newState.players = resetPlayers;
                            newState.phase = GamePhase.RESULT;
                        }
                    }
                }
                break;
        }

        if (shouldBroadcast) {
            // We need to broadcast the calculated newState
            // But we are inside setGameState, so we can't call broadcastState directly easily 
            // without being careful about recursion or state sync.
            // Hack: Broadcast 'newState' manually here.
            const msg: NetworkMessage = { type: 'STATE_UPDATE', payload: newState };
            connectionsRef.current.forEach(conn => {
                if (conn.open) conn.send(msg);
            });
        }

        return newState;
    });
  };

  // --- ACTIONS ---

  const createGame = () => {
      if (!myName) return;
      setIsHost(true);
      setIsConnected(true);
      setHostId(myPeerId);
      
      const me: Player = {
          id: myPeerId,
          name: myName,
          avatarColor: COLORS[Math.floor(Math.random() * COLORS.length)],
          score: 0,
          isHost: true,
          hasSubmitted: false
      };
      
      // We set state directly here because we are the host
      setGameState(prev => ({ ...prev, players: [me] }));
  };

  const joinGame = () => {
      if (!myName || !joinCodeInput) return;
      setErrorMsg(null);
      setIsJoining(true);
      
      // Close existing connection if any
      if (hostConnectionRef.current) {
          hostConnectionRef.current.close();
      }

      const conn = peerRef.current.connect(joinCodeInput, {
          reliable: true
      });
      
      conn.on('open', () => {
          setIsJoining(false);
          setIsConnected(true);
          setHostId(joinCodeInput);
          hostConnectionRef.current = conn;
          
          // Send join request
          const joinMsg: NetworkMessage = {
              type: 'JOIN',
              payload: {
                  name: myName,
                  avatarColor: COLORS[Math.floor(Math.random() * COLORS.length)]
              }
          };
          conn.send(joinMsg);
      });

      conn.on('error', (err: any) => {
          console.error("Connection error:", err);
          setIsJoining(false);
          setErrorMsg("Could not connect to host.");
      });

      conn.on('close', () => {
          setIsConnected(false);
          setIsJoining(false);
          setErrorMsg("Disconnected from host.");
          setGameState({ phase: GamePhase.LOBBY, players: [], roundData: [] });
      });

      conn.on('data', (data: NetworkMessage) => {
          handleNetworkMessage(data, 'HOST');
      });
  };

  const startGame = () => {
      sendToHost({ type: 'START_GAME' });
  };

  const submitMyFact = () => {
      sendToHost({ type: 'SUBMIT_FACT', payload: { fact: myFact } });
  };

  const submitMyThumbnail = (data: ThumbnailData) => {
      sendToHost({ type: 'SUBMIT_THUMBNAIL', payload: { thumbnail: data } });
  };

  const submitVote = (idx: number) => {
      // Prevent voting for self
      const round = gameState.roundData[idx];
      if (round.assignedToPlayerId === myPeerId) return; // Can't vote for your own drawing
      
      sendToHost({ type: 'VOTE', payload: { roundIndex: idx } });
  };

  const nextSlide = () => {
      const currentIdx = gameState.presentationIndex || 0;
      // If we are at the end, go to vote
      if (currentIdx >= gameState.roundData.length - 1) {
          broadcastState({
              ...gameState,
              phase: GamePhase.VOTE,
              presentationIndex: 0
          });
      } else {
          broadcastState({
              ...gameState,
              presentationIndex: currentIdx + 1
          });
      }
  };

  // --- DERIVED STATE UPDATES ---
  useEffect(() => {
      // Check if I have an assignment
      if (gameState.phase === GamePhase.EDIT) {
          const myRound = gameState.roundData.find(r => r.assignedToPlayerId === myPeerId);
          setMyAssignedFact(myRound || null);
      }
  }, [gameState.roundData, gameState.phase, myPeerId]);

  // --- RENDERERS ---

  if (!isConnected) {
      return (
        <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
            <div className="max-w-md w-full bg-gray-800 rounded-xl p-8 border border-gray-700 space-y-6 shadow-2xl">
                <h1 className="font-impact text-6xl text-center text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-red-500 to-pink-500 uppercase tracking-wide drop-shadow-lg">
                    Clickbait Royale
                </h1>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-gray-400 text-sm font-bold mb-2">YOUR NAME</label>
                        <input 
                            value={myName}
                            onChange={e => setMyName(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-600 rounded p-3 text-white focus:border-yellow-500 outline-none"
                            placeholder="Enter Username..."
                            maxLength={12}
                        />
                    </div>

                    <div className="flex gap-4 pt-4">
                        <div className="flex-1">
                            <button 
                                onClick={createGame}
                                disabled={!myName || !myPeerId || isJoining}
                                className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-black uppercase rounded shadow-lg active:translate-y-1 transition-all"
                            >
                                Host Game
                            </button>
                        </div>
                    </div>

                    <div className="relative flex items-center gap-2 py-2">
                        <div className="flex-grow border-t border-gray-600"></div>
                        <span className="text-gray-500 text-xs">OR</span>
                        <div className="flex-grow border-t border-gray-600"></div>
                    </div>

                    <div className="space-y-2">
                         <div className="flex gap-2">
                             <input 
                                value={joinCodeInput}
                                onChange={e => setJoinCodeInput(e.target.value)}
                                className="flex-1 bg-gray-900 border border-gray-600 rounded p-3 text-white text-sm font-mono focus:border-blue-500 outline-none uppercase"
                                placeholder="ENTER ROOM CODE"
                            />
                            <button 
                                onClick={joinGame}
                                disabled={!myName || !myPeerId || !joinCodeInput || isJoining}
                                className="px-6 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold uppercase rounded shadow-lg min-w-[100px] flex items-center justify-center"
                            >
                                {isJoining ? <Loader2 className="animate-spin" /> : "JOIN"}
                            </button>
                        </div>
                        {errorMsg && (
                            <div className="text-red-500 text-sm flex items-center gap-2 bg-red-900/20 p-2 rounded">
                                <AlertCircle size={16} /> {errorMsg}
                            </div>
                        )}
                    </div>
                </div>
                {!myPeerId && <div className="text-center text-xs text-gray-500 animate-pulse">Connecting to Network...</div>}
                {myPeerId && <div className="text-center text-xs text-gray-700 font-mono">ID: {myPeerId}</div>}
            </div>
            
            <footer className="mt-8 text-gray-500 text-sm font-mono opacity-50 hover:opacity-100 transition-opacity">
                dog67 games
            </footer>
        </div>
      );
  }

  // --- LOBBY ---
  if (gameState.phase === GamePhase.LOBBY) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
        <div className="max-w-4xl w-full bg-gray-800 rounded-xl p-8 border border-gray-700 shadow-2xl">
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h2 className="text-3xl font-impact text-white uppercase">Lobby</h2>
                    <p className="text-gray-400">Waiting for players...</p>
                </div>
                <div className="bg-gray-900 p-4 rounded-lg border border-gray-600 flex flex-col items-center gap-2">
                    <span className="text-xs text-gray-500 font-bold uppercase">Room Code</span>
                    <div className="flex items-center gap-2">
                        <code className="text-2xl font-mono text-yellow-500 font-bold tracking-wider select-all">{hostId}</code>
                        <button 
                            onClick={() => navigator.clipboard.writeText(hostId)}
                            className="p-2 hover:bg-gray-800 rounded text-gray-400 hover:text-white"
                        >
                            <Copy size={16} />
                        </button>
                    </div>
                </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {gameState.players.map(p => (
                    <div key={p.id} className="bg-gray-700 p-4 rounded-lg flex flex-col items-center gap-2 animate-in fade-in zoom-in duration-300 relative">
                         {p.id === myPeerId && (
                            <span className="absolute top-2 left-2 text-[10px] bg-blue-500 px-1 rounded text-white">YOU</span>
                        )}
                        <div className={`w-16 h-16 rounded-full ${p.avatarColor} flex items-center justify-center text-2xl shadow-lg border-2 ${p.isHost ? 'border-yellow-400' : 'border-white/20'}`}>
                            {p.isHost && <Crown size={24} className="text-yellow-900 absolute -mt-16" />}
                            👤
                        </div>
                        <span className="font-bold text-white truncate w-full text-center">{p.name}</span>
                        {p.isHost && <span className="text-[10px] bg-yellow-500 text-black px-2 rounded-full font-bold">HOST</span>}
                    </div>
                ))}
                {/* Placeholders */}
                {Array.from({ length: Math.max(0, 7 - gameState.players.length) }).map((_, i) => (
                    <div key={i} className="border-2 border-dashed border-gray-700 rounded-lg flex items-center justify-center h-32 opacity-50">
                        <Users className="text-gray-600" />
                    </div>
                ))}
            </div>

            {isHost ? (
                 <button 
                    onClick={startGame}
                    disabled={gameState.players.length < 2}
                    className="w-full py-4 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-black text-2xl uppercase rounded-lg shadow-[0_4px_0_rgb(20,83,45)] active:translate-y-[4px] active:shadow-none transition-all flex items-center justify-center gap-3"
                >
                    <Play size={28} /> Start Game
                </button>
            ) : (
                <div className="text-center text-xl text-yellow-500 font-bold animate-pulse">
                    Waiting for Host to start...
                </div>
            )}
        </div>
      </div>
    );
  }

  // --- PHASE 1: INPUT ---
  if (gameState.phase === GamePhase.INPUT) {
    const iHaveSubmitted = gameState.players.find(p => p.id === myPeerId)?.hasSubmitted;

    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
        <div className="max-w-lg w-full bg-gray-800 rounded-xl p-8 border border-gray-700 space-y-6">
            <h2 className="text-2xl font-bold text-center">Phase 1: Be Boring</h2>
            <p className="text-gray-400 text-center">Write a completely mundane fact about your day.</p>
            
            {!iHaveSubmitted ? (
                <>
                    <input 
                        type="text" 
                        value={myFact}
                        onChange={(e) => setMyFact(e.target.value)}
                        placeholder="e.g., I ate toast today."
                        className="w-full bg-gray-900 border border-gray-600 rounded-lg p-4 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 text-lg"
                        maxLength={60}
                    />
                    <button 
                        onClick={submitMyFact} 
                        disabled={!myFact.trim()}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                    >
                        Submit Boring Fact
                    </button>
                </>
            ) : (
                <div className="text-center py-8">
                    <Loader2 className="animate-spin mx-auto text-yellow-500 mb-4" size={48} />
                    <p className="text-xl font-bold text-white">Waiting for other players...</p>
                    <div className="mt-4 text-sm text-gray-500">
                        {gameState.players.filter(p => p.hasSubmitted).length} / {gameState.players.length} ready
                    </div>
                </div>
            )}
        </div>
      </div>
    );
  }

  // --- PHASE 2: SWAP ---
  if (gameState.phase === GamePhase.SWAP) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
         <div className="text-center space-y-4 animate-bounce">
             <RotateCcw size={64} className="text-yellow-500 mx-auto" />
             <h2 className="text-4xl font-black uppercase text-white">Swapping Facts...</h2>
         </div>
      </div>
    );
  }

  // --- PHASE 3: EDIT ---
  if (gameState.phase === GamePhase.EDIT) {
      // Small safety check - sometimes phase updates before local roundData sync if network is weird
      // But usually they come in same packet.
      if (!myAssignedFact) {
          return (
            <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
                 <Loader2 className="animate-spin text-white mb-4" size={32} />
                 <p className="text-white">Loading assignment...</p>
                 <p className="text-xs text-gray-500 mt-2">ID: {myPeerId}</p>
            </div>
          );
      }

      const iHaveSubmitted = gameState.players.find(p => p.id === myPeerId)?.hasSubmitted;

      if (iHaveSubmitted) {
          return (
            <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
                 <div className="text-center py-8">
                    <Loader2 className="animate-spin mx-auto text-green-500 mb-4" size={48} />
                    <h2 className="text-3xl font-impact text-white mb-2">UPLOADED!</h2>
                    <p className="text-xl text-gray-400">Waiting for other clickbait artists...</p>
                    <div className="mt-4 text-sm text-gray-500">
                        {gameState.players.filter(p => p.hasSubmitted).length} / {gameState.players.length} ready
                    </div>
                </div>
            </div>
          );
      }

      return (
         <div className="h-screen flex flex-col">
             <div className="bg-yellow-500 text-black p-2 text-center font-bold text-lg flex justify-between items-center px-6 shrink-0">
                 <span>MAKE THIS VIRAL:</span>
                 <span className="bg-black text-white px-3 py-1 rounded font-mono text-sm">"{myAssignedFact.originalFact}"</span>
             </div>
             <div className="flex-1 overflow-hidden relative">
                 <CanvasEditor fact={myAssignedFact.originalFact} onComplete={submitMyThumbnail} />
             </div>
         </div>
     );
  }

  // --- PHASE: PRESENTATION (Slideshow) ---
  if (gameState.phase === GamePhase.PRESENTATION) {
      const idx = gameState.presentationIndex || 0;
      const round = gameState.roundData[idx];
      
      if (!round) return <div className="bg-gray-900 h-screen flex items-center justify-center">Loading slides...</div>;
      
      const artist = gameState.players.find(p => p.id === round.assignedToPlayerId);

      return (
          <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
              <div className="w-full max-w-6xl space-y-6">
                  <div className="text-center animate-in slide-in-from-top duration-500 fade-in">
                      <h2 className="text-xl text-gray-400 uppercase tracking-widest mb-4">Original Fact by {round.ownerName}</h2>
                      <div className="text-2xl md:text-4xl font-bold bg-white text-black inline-block px-8 py-4 rotate-[-1deg] shadow-lg">
                          "{round.originalFact}"
                      </div>
                  </div>

                  <div className="aspect-video bg-black rounded-xl border-4 border-gray-700 shadow-2xl relative overflow-hidden mx-auto w-full max-w-4xl animate-in zoom-in duration-500 fade-in">
                       {round.thumbnail && (
                             <div 
                                className="w-full h-full relative"
                                style={{
                                    backgroundColor: round.thumbnail.bgColor,
                                    filter: `saturate(${round.thumbnail.filterSaturation}%) contrast(${round.thumbnail.filterContrast}%) blur(${round.thumbnail.filterBlur || 0}px)`
                                }}
                            >
                                {/* Background Image if exists */}
                                {round.thumbnail.imageUrl && <img src={round.thumbnail.imageUrl} className="absolute inset-0 w-full h-full object-contain" />}
                                
                                {round.thumbnail.canvasState?.map(el => (
                                    <div 
                                        key={el.id}
                                        style={{
                                            position: 'absolute',
                                            left: `${(el.x / 800) * 100}%`,
                                            top: `${(el.y / 450) * 100}%`,
                                            width: el.type === 'text' ? 'auto' : `${(el.width * el.scale / 800) * 100}%`,
                                            transform: `rotate(${el.rotation}deg)`,
                                            zIndex: el.zIndex,
                                            color: el.color,
                                        }}
                                        className={el.type === 'text' ? 'uppercase whitespace-nowrap' : ''}
                                    >
                                        {el.type === 'text' ? (
                                            <span style={{ fontFamily: el.fontFamily || 'Anton', fontSize: '2.5vw' }} className="drop-shadow-md">{el.content}</span>
                                        ) : el.type === 'image' ? (
                                            <img src={el.content} className="w-full h-full object-contain drop-shadow-md" />
                                        ) : (
                                            <div dangerouslySetInnerHTML={{__html: el.content}} />
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                  </div>

                  <div className="text-center pt-4 animate-in slide-in-from-bottom duration-500 fade-in">
                       <h3 className="text-gray-500 text-sm uppercase">Created by</h3>
                       <p className="text-3xl font-impact text-white tracking-wider">{artist?.name || "Unknown"}</p>
                  </div>

                  {isHost ? (
                      <div className="flex justify-center pt-8">
                        <button 
                            onClick={nextSlide}
                            className="px-12 py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black text-2xl uppercase rounded-full shadow-xl active:scale-95 transition-transform flex items-center gap-2 hover:shadow-yellow-500/50"
                        >
                            Next <ChevronRight strokeWidth={4} />
                        </button>
                      </div>
                  ) : (
                      <div className="text-center text-yellow-500 animate-pulse font-bold pt-8">
                          Waiting for Host...
                      </div>
                  )}
              </div>
          </div>
      )
  }

  // --- PHASE 4: VOTE ---
  if (gameState.phase === GamePhase.VOTE) {
      const iHaveSubmitted = gameState.players.find(p => p.id === myPeerId)?.hasSubmitted;
      
      return (
        <div className="min-h-screen bg-gray-900 p-8 overflow-y-auto">
            <h2 className="text-3xl font-bold text-center mb-8 text-white uppercase tracking-wider">
                {iHaveSubmitted ? "Waiting for others to vote..." : "Vote for the most CLICKABLE video"}
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 max-w-[1600px] mx-auto pb-20">
                {gameState.roundData.map((round, idx) => {
                    const isMyDrawing = round.assignedToPlayerId === myPeerId;
                    
                    return (
                        <div 
                            key={idx} 
                            className={`bg-black rounded-lg overflow-hidden border-4 transition-all group relative
                                ${isMyDrawing ? 'border-gray-700 opacity-70' : 'border-transparent hover:border-yellow-500 cursor-pointer'}
                                ${iHaveSubmitted ? 'pointer-events-none grayscale opacity-50' : ''}
                            `}
                            onClick={() => !iHaveSubmitted && !isMyDrawing && submitVote(idx)}
                        >
                            <div className="aspect-video bg-gray-800 relative flex items-center justify-center">
                                {/* Render Canvas Data */}
                                {round.thumbnail && (
                                    <div 
                                        className="w-full h-full relative overflow-hidden pointer-events-none"
                                        style={{
                                            backgroundColor: round.thumbnail.bgColor,
                                            filter: `saturate(${round.thumbnail.filterSaturation}%) contrast(${round.thumbnail.filterContrast}%) blur(${round.thumbnail.filterBlur || 0}px)`
                                        }}
                                    >
                                        {/* Background Image if exists */}
                                        {round.thumbnail.imageUrl && <img src={round.thumbnail.imageUrl} className="absolute inset-0 w-full h-full object-contain" />}
                                        
                                        {/* Canvas Elements */}
                                        {round.thumbnail.canvasState?.map(el => (
                                            <div 
                                                key={el.id}
                                                style={{
                                                    position: 'absolute',
                                                    left: `${(el.x / 800) * 100}%`,
                                                    top: `${(el.y / 450) * 100}%`,
                                                    width: el.type === 'text' ? 'auto' : `${(el.width * el.scale / 800) * 100}%`,
                                                    transform: `rotate(${el.rotation}deg)`,
                                                    zIndex: el.zIndex,
                                                    color: el.color,
                                                }}
                                                className={el.type === 'text' ? 'uppercase whitespace-nowrap' : ''}
                                            >
                                                {el.type === 'text' ? (
                                                    <span 
                                                        style={{ fontFamily: el.fontFamily || 'Anton', fontSize: '2vw' }}
                                                        className="drop-shadow-md"
                                                    >
                                                        {el.content}
                                                    </span>
                                                ) : el.type === 'image' ? (
                                                    <img src={el.content} className="w-full h-full object-contain drop-shadow-md" />
                                                ) : (
                                                    <div dangerouslySetInnerHTML={{__html: el.content}} />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                
                                {!isMyDrawing && !iHaveSubmitted && (
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity z-50">
                                        <div className="bg-white text-black px-6 py-2 rounded-full font-bold flex items-center gap-2 transform scale-110">
                                            <ThumbsUp size={20} /> VOTE
                                        </div>
                                    </div>
                                )}

                                {isMyDrawing && (
                                     <div className="absolute top-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
                                         YOURS
                                     </div>
                                )}
                            </div>
                            <div className="p-4 bg-gray-800">
                                <p className="text-gray-400 text-xs uppercase font-bold">Original Fact</p>
                                <p className="text-white">"{round.originalFact}"</p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
      );
  }

  // --- PHASE 5: RESULT ---
  if (gameState.phase === GamePhase.RESULT) {
      const sortedRounds = [...gameState.roundData].sort((a, b) => b.votes - a.votes);
      const winnerRound = sortedRounds[0];
      const winner = gameState.players.find(p => p.id === winnerRound.assignedToPlayerId);

      return (
        <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 relative overflow-hidden">
             <div className="z-10 text-center space-y-8 max-w-4xl w-full">
                 <h2 className="text-6xl font-impact text-white uppercase tracking-tighter drop-shadow-lg">Results</h2>
                 
                 <div className="bg-gray-800 rounded-xl p-8 border-2 border-yellow-500 shadow-[0_0_50px_rgba(234,179,8,0.3)] animate-in zoom-in duration-500">
                     <div className="text-yellow-400 font-bold text-xl mb-4 uppercase tracking-widest">🏆 Most Viral 🏆</div>
                     <div className="text-6xl font-black text-white mb-2">{winner?.name}</div>
                     <div className="text-gray-400 mb-8">{winnerRound.votes} Votes</div>

                     {/* Show Winning Thumbnail */}
                     <div className="max-w-md mx-auto aspect-video bg-black rounded border-4 border-yellow-500 relative overflow-hidden mb-8">
                        {winnerRound.thumbnail && (
                             <div 
                                className="w-full h-full relative"
                                style={{
                                    backgroundColor: winnerRound.thumbnail.bgColor,
                                    filter: `saturate(${winnerRound.thumbnail.filterSaturation}%) contrast(${winnerRound.thumbnail.filterContrast}%) blur(${winnerRound.thumbnail.filterBlur || 0}px)`
                                }}
                            >
                                {winnerRound.thumbnail.canvasState?.map(el => (
                                    <div 
                                        key={el.id}
                                        style={{
                                            position: 'absolute',
                                            left: `${(el.x / 800) * 100}%`,
                                            top: `${(el.y / 450) * 100}%`,
                                            width: el.type === 'text' ? 'auto' : `${(el.width * el.scale / 800) * 100}%`,
                                            transform: `rotate(${el.rotation}deg)`,
                                            zIndex: el.zIndex,
                                            color: el.color,
                                        }}
                                        className={el.type === 'text' ? 'uppercase whitespace-nowrap' : ''}
                                    >
                                        {el.type === 'text' ? (
                                            <span style={{ fontFamily: el.fontFamily || 'Anton', fontSize: '2vw' }}>{el.content}</span>
                                        ) : el.type === 'image' ? (
                                            <img src={el.content} className="w-full h-full object-contain drop-shadow-md" />
                                        ) : (
                                            <div dangerouslySetInnerHTML={{__html: el.content}} />
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                     </div>
                     
                     <div className="mt-8 grid gap-4 max-h-64 overflow-y-auto">
                         {sortedRounds.map((round, idx) => {
                             const player = gameState.players.find(p => p.id === round.assignedToPlayerId);
                             return (
                                 <div key={idx} className="flex items-center justify-between bg-gray-900 p-4 rounded border border-gray-700 hover:border-gray-500 transition-colors">
                                     <div className="flex items-center gap-4">
                                         <span className="text-3xl font-impact text-gray-600 w-8">#{idx + 1}</span>
                                         <div className="text-left">
                                             <div className="font-bold text-white text-lg">{player?.name}</div>
                                             <div className="text-xs text-gray-500">Remixed: "{round.originalFact}"</div>
                                         </div>
                                     </div>
                                     <div className="font-bold text-yellow-500 text-2xl">{round.votes} <span className="text-sm text-gray-600">pts</span></div>
                                 </div>
                             );
                         })}
                     </div>
                 </div>

                 {isHost && (
                     <button onClick={() => broadcastState({ phase: GamePhase.LOBBY, players: gameState.players, roundData: [] })} className="px-8 py-3 bg-white text-black font-bold rounded-full hover:scale-105 transition-transform uppercase">
                         Return to Lobby
                     </button>
                 )}
                 {!isHost && <div className="text-gray-500 animate-pulse">Waiting for Host to restart...</div>}
             </div>
        </div>
      );
  }

  return <div className="bg-gray-900 h-screen text-white flex items-center justify-center">Loading...</div>;
};

export default App;
