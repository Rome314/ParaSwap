package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
)

const contractsDir = "contracts"

type addressesFile struct {
	Ethereum map[string]map[string]string `json:"ethereum"`
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/contracts", handleContracts)
	mux.HandleFunc("/addresses", handleAddresses)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("para-swap backend listening on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

func handleContracts(w http.ResponseWriter, _ *http.Request) {
	abiDir := filepath.Join(contractsDir, "abis")
	entries, err := os.ReadDir(abiDir)
	if err != nil {
		http.Error(w, fmt.Sprintf("read abis: %v (run npm run build:contracts)", err), http.StatusServiceUnavailable)
		return
	}

	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && filepath.Ext(e.Name()) == ".json" {
			names = append(names, e.Name())
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"abis": names})
}

func handleAddresses(w http.ResponseWriter, _ *http.Request) {
	data, err := os.ReadFile(filepath.Join(contractsDir, "addresses.json"))
	if err != nil {
		http.Error(w, fmt.Sprintf("read addresses: %v (run npm run build:contracts)", err), http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(data)
}
