import { useEffect, useState } from "react"

function App() {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    fetch("http://localhost:8000/")
      .then((res) => res.json())
      .then((data) => setMessage(data.message))
  }, [])

  return <p>{message ?? "Loading..."}</p>
}

export default App
