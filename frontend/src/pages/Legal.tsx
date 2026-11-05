import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { SiteFooter } from "@/components/layout/SiteFooter";

const REPO = "https://github.com/khan-0910/Pitchside-Prem-";
const UPDATED = "5 November 2026";

const Out = ({ href, children }: { href: string; children: ReactNode }) => (
  <a className="underline underline-offset-4" href={href} rel="noreferrer" target="_blank">{children}</a>
);

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mt-7">
    <h2 className="text-lg">{title}</h2>
    <div className="mt-1 space-y-2">{children}</div>
  </section>
);

const Issues = () => <Out href={`${REPO}/issues`}>open an issue on GitHub</Out>;

const PAGES = {
  privacy: {
    title: "Privacy policy",
    body: (
      <>
        <Section title="What we collect">
          <p>Nothing about you. Pitchside has no accounts, forms, adverts, analytics or tracking cookies.</p>
        </Section>
        <Section title="What stays in your browser">
          <p>
            Your settings, such as reduced motion and simulation size, are saved in your browser's local storage under
            the name pitchside.settings. They are never sent to us. Clearing your site data removes them.
          </p>
        </Section>
        <Section title="Hosting">
          <p>
            The public site runs on GitHub Pages. GitHub may record technical details such as your IP address to run and
            protect its service. See the <Out href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">GitHub privacy statement</Out>.
          </p>
        </Section>
        <Section title="Player information">
          <p>
            Pitchside shows professional footballers' public football data, such as names, ages, clubs, match statistics
            and published market values. To correct or query an entry, <Issues />.
          </p>
        </Section>
        <Section title="Contact and changes">
          <p>For a privacy question, <Issues />. If this policy changes, the date on this page changes too.</p>
        </Section>
      </>
    ),
  },
  terms: {
    title: "Terms of use",
    body: (
      <>
        <Section title="Using Pitchside">
          <p>You may browse Pitchside for personal use. Do not copy its data in bulk or resell it. Each data provider sets its own rules.</p>
        </Section>
        <Section title="Not advice">
          <p>
            Predictions, valuations and simulations are statistical estimates and can be wrong. They are not betting,
            financial or transfer advice. If gambling is causing you harm, <Out href="https://www.begambleaware.org">BeGambleAware</Out> offers free support.
          </p>
        </Section>
        <Section title="Accuracy">
          <p>
            Data comes from third parties and can be late, incomplete or wrong. The public site is a snapshot and does not
            update live. Pitchside is provided as it is, with no promise that it is accurate or always available.
          </p>
        </Section>
        <Section title="Liability">
          <p>As far as the law allows, Pitchside is not liable for any loss that comes from using the site. Nothing here limits rights you cannot lawfully give up.</p>
        </Section>
        <Section title="Names and marks">
          <p>Pitchside is independent. Club, league and player names belong to their owners and are used only to identify them. The site uses no club crests or league logos.</p>
        </Section>
      </>
    ),
  },
  credits: {
    title: "Data credits",
    body: (
      <>
        <Section title="Data sources">
          <ul className="list-disc space-y-1 pl-5">
            <li>Football data provided by the <Out href="https://www.football-data.org">Football-Data.org API</Out>.</li>
            <li><Out href="https://fantasy.premierleague.com">Fantasy Premier League</Out> public data: players, match statistics and availability. Unofficial use.</li>
            <li><Out href="https://www.football-data.co.uk">football-data.co.uk</Out>: historical results, match statistics and bookmaker odds.</li>
            <li><Out href="https://github.com/dcaribou/transfermarkt-datasets">transfermarkt-datasets</Out>: a third-party dataset of market values and appearances. It is not an official Transfermarkt feed.</li>
          </ul>
        </Section>
        <Section title="Design">
          <p>Type is Archivo, under the SIL Open Font License. Icons are from Phosphor, under the MIT License. Club colours are used only to tell teams apart.</p>
        </Section>
        <Section title="Freshness">
          <p>See <Link className="underline underline-offset-4" to="/app/data">Data health</Link> for when each source last updated.</p>
        </Section>
      </>
    ),
  },
};

export default function Legal({ page }: { page: keyof typeof PAGES }) {
  const { title, body } = PAGES[page];
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-8 sm:px-6">
      <Link to="/" className="display text-lg normal-case">Pitchside</Link>
      <main className="mt-8 flex-1">
        <h1 className="text-[1.9rem]">{title}</h1>
        <p className="text-sm text-muted">Last updated {UPDATED}</p>
        {body}
      </main>
      <SiteFooter className="mt-12 text-muted" />
    </div>
  );
}
