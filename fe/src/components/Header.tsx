import React, { useState, useEffect } from "react"
import { Sun, Moon, Search, Wifi, Settings, AlertCircle, CheckCircle } from "lucide-react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Select } from "./ui/select"

export interface NetworkConfig {
  name: string
  url: string
}

export const DEFAULT_NETWORKS: Record<string, NetworkConfig> = {
  mainnet: { name: "Mainnet Beta", url: "https://api.mainnet-beta.solana.com" },
  devnet: { name: "Devnet", url: "https://api.devnet.solana.com" },
  testnet: { name: "Testnet", url: "https://api.testnet.solana.com" },
}

interface HeaderProps {
  network: string
  setNetwork: (network: string) => void
  rpcUrl: string
  setRpcUrl: (url: string) => void
  onSearch: (query: string) => void
  backendUrl: string
}

export const Header: React.FC<HeaderProps> = ({
  network,
  setNetwork,
  rpcUrl,
  setRpcUrl,
  onSearch,
  backendUrl,
}) => {
  const [searchQuery, setSearchQuery] = useState("")
  const [isDarkMode, setIsDarkMode] = useState(true)
  const [showConfig, setShowConfig] = useState(false)
  const [testRpcUrl, setTestRpcUrl] = useState(rpcUrl)
  const [rpcStatus, setRpcStatus] = useState<{ type: "success" | "error" | null; msg: string }>({
    type: null,
    msg: "",
  })
  const [testing, setTesting] = useState(false)

  // Initialize Dark Mode
  useEffect(() => {
    const isDark = localStorage.getItem("theme") !== "light"
    setIsDarkMode(isDark)
    if (isDark) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }, [])

  const toggleTheme = () => {
    const newDark = !isDarkMode
    setIsDarkMode(newDark)
    if (newDark) {
      document.documentElement.classList.add("dark")
      localStorage.setItem("theme", "dark")
    } else {
      document.documentElement.classList.remove("dark")
      localStorage.setItem("theme", "light")
    }
  }

  const handleNetworkChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const net = e.target.value
    setNetwork(net)
    if (net !== "custom") {
      setRpcUrl(DEFAULT_NETWORKS[net].url)
    } else {
      setShowConfig(true)
    }
  }

  const handleTestRpc = async () => {
    if (!testRpcUrl) return
    setTesting(true)
    setRpcStatus({ type: null, msg: "" })
    try {
      const res = await fetch(`${backendUrl}/api/rpc/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rpc_url: testRpcUrl }),
      })
      const data = await res.json()
      if (data.success) {
        setRpcStatus({
          type: "success",
          msg: "RPC Connection Successful!",
        })
      } else {
        setRpcStatus({
          type: "error",
          msg: data.message || "Failed to query RPC.",
        })
      }
    } catch (e) {
      setRpcStatus({
        type: "error",
        msg: "Failed to reach backend server.",
      })
    } finally {
      setTesting(false)
    }
  }

  const handleSaveRpc = () => {
    setRpcUrl(testRpcUrl)
    setNetwork("custom")
    setShowConfig(false)
  }

  const handleSubmitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      onSearch(searchQuery.trim())
    }
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => onSearch("")}>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 text-white font-bold text-xl shadow-lg glow-primary">
            S
          </div>
          <span className="hidden sm:inline-block text-xl font-bold bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
            SolSight
          </span>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSubmitSearch} className="flex-1 max-w-xl mx-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by Public Address or Transaction Signature..."
              className="pl-10 w-full bg-muted/40 border-muted-foreground/20 focus-visible:ring-indigo-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </form>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {/* Network Selector */}
          <div className="flex items-center gap-1.5 bg-muted/40 border border-muted-foreground/15 rounded-md px-2 py-1 h-10">
            <Wifi className="h-4 w-4 text-indigo-500 animate-pulse" />
            <Select
              className="border-0 bg-transparent h-8 py-0 focus:ring-0 focus:ring-offset-0 text-xs w-28 pr-6"
              value={network}
              onChange={handleNetworkChange}
            >
              <option value="devnet" className="bg-background">Devnet</option>
              <option value="mainnet" className="bg-background">Mainnet</option>
              <option value="testnet" className="bg-background">Testnet</option>
              <option value="custom" className="bg-background">Custom RPC</option>
            </Select>
          </div>

          {/* Config Trigger */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              setTestRpcUrl(rpcUrl)
              setRpcStatus({ type: null, msg: "" })
              setShowConfig(true)
            }}
            title="Configure RPC Endpoint"
          >
            <Settings className="h-4 w-4 text-muted-foreground" />
          </Button>

          {/* Theme Toggle */}
          <Button variant="ghost" size="icon" onClick={toggleTheme}>
            {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Custom RPC Modal */}
      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="text-lg font-bold">Configure RPC Connection</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowConfig(false)}>✕</Button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">RPC Endpoint URL</label>
                <Input
                  placeholder="https://your-custom-rpc-url.com"
                  value={testRpcUrl}
                  onChange={(e) => setTestRpcUrl(e.target.value)}
                />
              </div>

              {rpcStatus.type && (
                <div
                  className={`flex items-start gap-2 rounded-md p-3 text-xs ${
                    rpcStatus.type === "success"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                  }`}
                >
                  {rpcStatus.type === "success" ? (
                    <CheckCircle className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                  <span>{rpcStatus.msg}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <Button
                  className="flex-1"
                  variant="outline"
                  onClick={handleTestRpc}
                  disabled={testing || !testRpcUrl}
                >
                  {testing ? "Testing..." : "Test Connection"}
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSaveRpc}
                  disabled={!testRpcUrl}
                >
                  Save URL
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
