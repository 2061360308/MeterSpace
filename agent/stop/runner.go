// Package stop 执行 agent 的停止前回收脚本（pre-stop）。
//
// 脚本由后端 `buildStopHook` 生成并内嵌在下发的 pre_stop 指令里，
// agent 落盘后由本包执行：打包未提交改动到 .snapshots/、导出配置，
// 并在 stdout 输出 `OSS_USAGE=<bytes>` 供后端持久化用量。
package stop

import (
	"bufio"
	"context"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

// ossUsageRe 匹配脚本输出的 OSS 用量行（lib/userdata.ts buildStopHook）。
var ossUsageRe = regexp.MustCompile(`OSS_USAGE=(\d+)`)

// Runner 执行 pre-stop 回收脚本。
type Runner struct {
	workdir string
	logf    func(level, msg string)
}

// NewRunner 创建 Runner；workdir 为脚本运行目录，logf 收到脚本 stdout/stderr 逐行。
func NewRunner(workdir string, logf func(level, msg string)) *Runner {
	if logf == nil {
		logf = func(level, msg string) {}
	}
	return &Runner{workdir: workdir, logf: logf}
}

// RunPreStop 执行脚本，解析输出中的 `OSS_USAGE=(\d+)`。
// 超时会返回 ctx 的 error，且进程被 Kill。
func (r *Runner) RunPreStop(scriptPath string, timeout time.Duration) (ossUsage int64, err error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "bash", scriptPath)
	cmd.Dir = r.workdir

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return 0, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return 0, err
	}

	if err := cmd.Start(); err != nil {
		return 0, err
	}

	// 逐行收集 stdout，匹配 OSS_USAGE 行（匹配行在解析后仅记录，不重复整行输出）
	ossCh := make(chan int64, 1)
	go func() {
		scanner := bufio.NewScanner(stdout)
		var usage int64
		for scanner.Scan() {
			line := scanner.Text()
			if m := ossUsageRe.FindStringSubmatch(line); m != nil {
				if n := parseInt64(m[1]); n > 0 {
					usage = n
				}
				continue
			}
			if line != "" {
				r.logf("info", line)
			}
		}
		ossCh <- usage
	}()

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			if line := scanner.Text(); line != "" {
				r.logf("error", line)
			}
		}
	}()

	if err := cmd.Wait(); err != nil {
		return 0, err
	}

	usage, _ := <-ossCh
	return usage, nil
}

func parseInt64(s string) int64 {
	var n int64
	for _, c := range strings.TrimSpace(s) {
		if c < '0' || c > '9' {
			return 0
		}
		n = n*10 + int64(c-'0')
	}
	return n
}