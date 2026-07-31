import backgroundStyles from "./control-center/control-center.module.css";
import styles from "./home.module.css";

export default function Home() {
  return (
    <main className={backgroundStyles.page}>
      <div className={backgroundStyles.glow} aria-hidden="true" />
      <h1 className={styles.title}>
        <span>SCREEN CONTROL SYSTEM</span>
      </h1>
    </main>
  );
}
