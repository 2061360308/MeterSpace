package crypto

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"
	"time"
)

// GenerateSignature generates HMAC-SHA256 signature
func GenerateSignature(token, message string) string {
	mac := hmac.New(sha256.New, []byte(token))
	mac.Write([]byte(message))
	return hex.EncodeToString(mac.Sum(nil))
}

// VerifySignature verifies HMAC-SHA256 signature
func VerifySignature(token, workspaceID, action, timestamp, signature string) bool {
	message := fmt.Sprintf("%s:%s:%s", workspaceID, action, timestamp)
	expected := GenerateSignature(token, message)
	return hmac.Equal([]byte(signature), []byte(expected))
}

// IsTimestampValid checks if timestamp is within the allowed window (default 5 minutes)
func IsTimestampValid(timestamp string, windowSeconds int) bool {
	ts, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return false
	}
	diff := time.Now().Unix() - ts
	return diff >= -int64(windowSeconds) && diff <= int64(windowSeconds)
}

// IsTimestampValidDefault checks if timestamp is within 5 minutes
func IsTimestampValidDefault(timestamp string) bool {
	return IsTimestampValid(timestamp, 300)
}
